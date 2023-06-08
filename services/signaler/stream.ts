import { KeyType } from '../../modules/key';
import { XSleepFor, sleepFor } from '../../modules/utils';
import { ILogger } from '../logger';
import { StoreService } from '../store';
import { StreamService } from '../stream';
import { QuorumProcessed, QuorumProfile } from '../../typedefs/quorum';
import { RedisClient, RedisMulti } from '../../typedefs/redis';
import {
  StreamData,
  StreamDataResponse,
  StreamError,
  StreamStatus
} from '../../typedefs/stream';

const MAX_RETRIES = 4; //max delay (10s using exponential backoff);
const MAX_TIMEOUT_MS = 60000;
const GRADUATED_INTERVAL_MS = 5000;
const BLOCK_DURATION = 15000; //Set to `15` so SIGINT/SIGTERM can interrupt; set to `0` to BLOCK indefinitely
const TEST_BLOCK_DURATION = 1000; //Set to `1000` so tests can interrupt quickly
const BLOCK_TIME_MS = process.env.NODE_ENV === 'test' ? TEST_BLOCK_DURATION : BLOCK_DURATION;
const REPORT_INTERVAL = 10000;
const UNKNOWN_STATUS_CODE = 500;
const UNKNOWN_STATUS_MESSAGE = 'unknown';

class StreamSignaler {
  static signalers: Set<StreamSignaler> = new Set();
  namespace: string;
  appId: string;
  guid: string;
  store: StoreService<RedisClient, RedisMulti>;
  stream: StreamService<RedisClient, RedisMulti>;
  logger: ILogger;
  throttle = 0;
  errorCount = 0;
  currentSlot: number | null = null;
  currentBucket: QuorumProcessed | null = null;
  auditData: QuorumProcessed[] = [];
  currentTimerId: NodeJS.Timeout | null = null;
  shouldConsume: boolean;

  constructor(namespace: string, appId: string, guid: string, stream: StreamService<RedisClient, RedisMulti>, store: StoreService<RedisClient, RedisMulti>, logger: ILogger) {
    this.namespace = namespace;
    this.appId = appId;
    this.guid = guid;
    this.stream = stream;
    this.store = store;
    this.logger = logger;
  }

  async createGroup(stream: string, group: string) {
    try {
      await this.store.xgroup('CREATE', stream, group, '$', 'MKSTREAM');
    } catch (err) {
      this.logger.info('Consumer Group name exists', { stream, group });
    }
  }

  async publishMessage(stream: string, streamData: StreamData|StreamDataResponse) {
    await this.store.xadd(stream, '*', 'message', JSON.stringify(streamData));
  }

  async consumeMessages(stream: string, group: string, consumer: string, callback: (streamData: StreamData) => Promise<StreamDataResponse|void>): Promise<void> {
    this.logger.info(`Stream Consumer Starting: ${stream} ${group} ${consumer}`);
    StreamSignaler.signalers.add(this);
    this.shouldConsume = true;
    await this.createGroup(stream, group);

    async function consume() {
      let sleep = XSleepFor(this.throttle);
      this.currentTimerId = sleep.timerId;
      await sleep.promise;
      if (!this.shouldConsume) {
        this.logger.info(`Stream Consumer Stopping: ${group} ${consumer} ${stream}`);
        return;
      }

      try {
        const result = await this.stream.xreadgroup('GROUP', group, consumer, 'BLOCK', BLOCK_TIME_MS, 'STREAMS', stream, '>');
        if (this.isStreamMessage(result)) {
          const [[, messages]] = result;
          for (const [id, message] of messages) {
            await this.consumeOne(stream, group, id, message, callback);
          }
        }
        setImmediate(consume.bind(this));
      } catch (err) {
        if (this.shouldConsume && process.env.NODE_ENV !== 'test') {
        this.logger.error(`Error reading from stream: ${stream}`, err);
          this.errorCount++;
          const timeout = Math.min(GRADUATED_INTERVAL_MS * (2 ** this.errorCount), MAX_TIMEOUT_MS);
          setTimeout(consume.bind(this), timeout);
        }
      }
    }
    consume.call(this);
  }

  isStreamMessage(result: any): boolean {
    return Array.isArray(result) && Array.isArray(result[0])
  }

  async consumeOne(stream: string, group: string, id: string, message: string[], callback: (streamData: StreamData) => Promise<StreamDataResponse|void>) {
    this.logger.info(`${group} received message ${id}`);
    const input: StreamData = JSON.parse(message[1]);
    let output: StreamDataResponse | void;
    try {
      output = await this.execStreamLeg(input, stream, id, callback.bind(this));
      this.errorCount = 0;
    } catch (err) {
      this.logger.error(`Error processing message: ${id} in stream: ${stream}`, err);
    }
    await this.publishResponse(input, output);
    await this.ackAndDelete(stream, group, id);
    this.audit(message[1], output ? JSON.stringify(output) : '', !(output && output.status === 'error'));
  }

  async execStreamLeg(input: StreamData, stream: string, id: string, callback: (streamData: StreamData) => Promise<StreamDataResponse|void>) {
    let output: StreamDataResponse | void;
    try {
      output = await callback(input);
    } catch (err) {
      this.logger.error(`Error processing message ${id} in stream: ${stream} for job ${input.metadata.jid}`, err);
      output = this.structureUnhandledError(input, err);
    }
    return output as StreamDataResponse;
  }

  async ackAndDelete(stream: string, group: string, id: string) {
    const multi = this.stream.getMulti();
    await this.stream.xack(stream, group, id, multi);
    await this.stream.xdel(stream, id, multi);
    await multi.exec();
  }

  async publishResponse(input: StreamData, output: StreamDataResponse | void) {
    if (output && typeof output === 'object') {
      if (output.status === 'error') {
        const [shouldRetry, timeout] = this.shouldRetry(input, output);
        if (shouldRetry) {
          await sleepFor(timeout);
          const key = this.stream.mintKey(KeyType.STREAMS, { appId: this.appId, topic: input.metadata.topic  });
          return await this.publishMessage(key, { 
            data: input.data,
            metadata: { ...input.metadata, try: (input.metadata.try || 0) + 1 },
            policies: input.policies,
          });
        } else {
          output = this.structureError(input, output);
        }
      }
      const key = this.stream.mintKey(KeyType.STREAMS, { appId: this.appId });
      return await this.publishMessage(key, output as StreamDataResponse);
    }
  }

  shouldRetry(input: StreamData, output: StreamDataResponse): [boolean, number] {
    const policies = input.policies?.retry;
    const errorCode = output.code.toString();
    const policy = policies?.[errorCode];
    const maxRetries = policy?.[0];
    const tryCount = Math.min(input.metadata.try || 0,  MAX_RETRIES);
    if (maxRetries >= tryCount) {
      return[true, Math.pow(10, tryCount)];
    }
    return [false, 0];
  }

  structureUnhandledError(input: StreamData, err: Error): StreamDataResponse {
    let error: Partial<StreamError> = {};
    if (typeof err.message === 'string') {
      error.message = err.message;
    } else {
      error.message = UNKNOWN_STATUS_MESSAGE;
    }
    if (typeof err.stack === 'string') {
      error.stack = err.stack;
    }
    if (typeof err.name === 'string') {
      error.name = err.name;
    }
    return {
      status: 'error',
      code: UNKNOWN_STATUS_CODE,
      metadata: { ...input.metadata },
      data: error as StreamError
    } as StreamDataResponse;
  }

  structureError(input: StreamData, output: StreamDataResponse): StreamDataResponse {
    const message = output.data?.message ? output.data?.message.toString() : UNKNOWN_STATUS_MESSAGE;
    const statusCode = output.code || output.data?.code;
    const code = isNaN(statusCode as number) ? UNKNOWN_STATUS_CODE : parseInt(statusCode.toString());
    const data: StreamError = { message, code };
    if (typeof output.data?.error === 'object') {
      data.error = { ...output.data.error };
    }
    return {
      status: StreamStatus.ERROR,
      code,
      metadata: { ...input.metadata },
      data
    } as StreamDataResponse;
  }
  
  static async stopConsuming() {
    for (const instance of [...StreamSignaler.signalers]) {
      instance.stopConsuming();
    }
    await sleepFor(BLOCK_TIME_MS);
  }
  
  async stopConsuming() {
    this.shouldConsume = false;
    this.logger.info('Stopping Stream Consumer');
    this.cancelThrottle();
    await sleepFor(BLOCK_TIME_MS);
  }

  cancelThrottle() {
    if (this.currentTimerId !== undefined) {
      clearTimeout(this.currentTimerId);
      this.currentTimerId = undefined;
    }
  }

  audit(input: string, output: string, success: boolean) {
    const bytesIn = Buffer.byteLength(input, 'utf8');
    const bytesOut = Buffer.byteLength(output, 'utf8');
    const currentTimestamp = Date.now();
    const currentSlot = Math.floor(currentTimestamp / REPORT_INTERVAL);
    if (this.currentSlot === currentSlot) {
      this.currentBucket.t = currentSlot * REPORT_INTERVAL;
      this.currentBucket.i += bytesIn;
      this.currentBucket.o += bytesOut;
      this.currentBucket.p += 1;
      this.currentBucket.f += success ? 0 : 1;
      this.currentBucket.s += success ? 1 : 0;
    } else {
      this.currentSlot = currentSlot;
      this.currentBucket = {
        t: currentSlot * REPORT_INTERVAL,
        i: bytesIn,
        o: bytesOut,
        p: 1,
        f: success ? 0 : 1,
        s: success ? 1 : 0
      };
      this.auditData.push(this.currentBucket);
    }
    this.cleanStaleData();
  }

  cleanStaleData() {
    const oneHourAgo = Date.now() - 3600000;
    this.auditData = this.auditData.filter(data => data.t >= oneHourAgo);
  }  

  report(): QuorumProfile {
    this.cleanStaleData();
    const report: QuorumProfile = {
      namespace: this.namespace,
      appId: this.appId,
      guid: this.guid,
      status: 'active',
      throttle: this.throttle,
      d: this.auditData
    };
    return report;
  }

  reportNow(): QuorumProfile {
    const currentTimestamp = Date.now();
    const fiveSecondsAgo = currentTimestamp - REPORT_INTERVAL;
      const currentWindowData = this.auditData.filter((data) => {
      return data.t >= fiveSecondsAgo && data.t <= currentTimestamp;
    });
    return {
      namespace: this.namespace,
      appId: this.appId,
      guid: this.guid,
      status: 'active',
      throttle: this.throttle,
      d: currentWindowData
    };
  }

  setThrottle(delayInMillis: number) {
    if (!Number.isInteger(delayInMillis) || delayInMillis < 0) {
      throw new Error('Throttle must be a non-negative integer');
    }
    this.throttle = delayInMillis;
    this.logger.info(`Throttle set to ${delayInMillis}ms`);
  }

  async claimUnacknowledgedMessages(stream: string, group: string, newConsumerName: string, idleTimeMs: number) {
    const [firstId, , count] = await this.store.xpending(stream, group);
    if (typeof count === 'number') {    
      if (count > 0) {
        const pendingMessages = await this.store.xpending(stream, group, firstId.toString(), '+', count);
        for (const pendingMessage of pendingMessages) {
          if (Array.isArray(pendingMessage)) {
            const [id, consumer, elapsedTimeMs] = pendingMessage;
            if (elapsedTimeMs > idleTimeMs) {
              this.logger.info(`Reclaiming message ${id} from ${consumer}`);
              await this.store.xclaim(stream, group, newConsumerName, idleTimeMs, id);
            }
          }
        }
      }
    }
  }
}

export { StreamSignaler };
