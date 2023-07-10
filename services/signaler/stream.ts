import { KeyType } from '../../modules/key';
import { XSleepFor, sleepFor } from '../../modules/utils';
import { ILogger } from '../logger';
import { StoreService } from '../store';
import { StreamService } from '../stream';
import { QuorumProcessed, QuorumProfile } from '../../types/quorum';
import { RedisClient, RedisMulti } from '../../types/redis';
import {
  StreamConfig,
  StreamData,
  StreamDataResponse,
  StreamError,
  StreamRole,
  StreamStatus
} from '../../types/stream';

const MAX_RETRIES = 4; //max delay (10s using exponential backoff);
const MAX_TIMEOUT_MS = 60000;
const GRADUATED_INTERVAL_MS = 5000;
const BLOCK_DURATION = 15000; //Set to `15` so SIGINT/SIGTERM can interrupt; set to `0` to BLOCK indefinitely
const TEST_BLOCK_DURATION = 1000; //Set to `1000` so tests can interrupt quickly
const BLOCK_TIME_MS = process.env.NODE_ENV === 'test' ? TEST_BLOCK_DURATION : BLOCK_DURATION;
const REPORT_INTERVAL = 10000;
const UNKNOWN_STATUS_CODE = 500;
const UNKNOWN_STATUS_MESSAGE = 'unknown';
const XCLAIM_MS = 1000 * 60; //max time a message can be unacked before it is claimed by another
const XPENDING_COUNT = 10;

class StreamSignaler {
  static signalers: Set<StreamSignaler> = new Set();
  namespace: string;
  appId: string;
  guid: string;
  role: StreamRole;
  topic: string | undefined;
  store: StoreService<RedisClient, RedisMulti>;
  stream: StreamService<RedisClient, RedisMulti>;
  xclaim: number;
  logger: ILogger;
  throttle = 0;
  errorCount = 0;
  currentSlot: number | null = null;
  currentBucket: QuorumProcessed | null = null;
  auditData: QuorumProcessed[] = [];
  currentTimerId: NodeJS.Timeout | null = null;
  shouldConsume: boolean;

  constructor(config: StreamConfig, stream: StreamService<RedisClient, RedisMulti>, store: StoreService<RedisClient, RedisMulti>, logger: ILogger) {
    this.namespace = config.namespace;
    this.appId = config.appId;
    this.guid = config.guid;
    this.role = config.role;
    this.topic = config.topic;
    this.stream = stream;
    this.store = store;
    this.xclaim = config.xclaim || XCLAIM_MS;
    this.logger = logger;
  }

  async createGroup(stream: string, group: string) {
    try {
      await this.store.xgroup('CREATE', stream, group, '$', 'MKSTREAM');
    } catch (err) {
      this.logger.info('consumer-group-exists', { stream, group });
    }
  }

  async publishMessage(stream: string, streamData: StreamData|StreamDataResponse) {
    await this.store.xadd(stream, '*', 'message', JSON.stringify(streamData));
  }

  async consumeMessages(stream: string, group: string, consumer: string, callback: (streamData: StreamData) => Promise<StreamDataResponse|void>): Promise<void> {
    this.logger.info(`stream-consume-message-starting`, { group, consumer, stream });
    StreamSignaler.signalers.add(this);
    this.shouldConsume = true;
    await this.createGroup(stream, group);
    let lastCheckedPendingMessagesAt = Date.now();

    async function consume() {
      let sleep = XSleepFor(this.throttle);
      this.currentTimerId = sleep.timerId;
      await sleep.promise;
      if (!this.shouldConsume) {
        this.logger.info(`stream-consumer-stopping`, { group, consumer, stream });
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

        // Check for pending messages now and then (Redis 6.2 syntax option!)
        const now = Date.now();
        if (now - lastCheckedPendingMessagesAt > this.xclaim) {
          lastCheckedPendingMessagesAt = now;
          const pendingMessages = await this.claimUnacknowledgedMessages(stream, group, consumer);
          for (const [id, message] of pendingMessages) {
            await this.consumeOne(stream, group, id, message, callback);
          }
        }
        setImmediate(consume.bind(this));
      } catch (err) {
        if (this.shouldConsume && process.env.NODE_ENV !== 'test') {
        this.logger.error(`stream-consume-message-failed`, { err, stream, group, consumer });
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
    this.logger.debug(`stream-consume-one-message-starting`, { id, stream, group });
    const input: StreamData = JSON.parse(message[1]);
    let output: StreamDataResponse | void;
    try {
      output = await this.execStreamLeg(input, stream, id, callback.bind(this));
      this.errorCount = 0;
    } catch (err) {
      this.logger.error(`stream-consume-one-message-failed`, { err, id, stream, group });
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
      this.logger.error(`stream-call-function-failed`, { err, id, stream });
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
    this.logger.info(`stream-consumer-starting`, this.topic ? { topic: this.topic } : undefined);
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
    const currentSlot = Math.floor(Date.now() / REPORT_INTERVAL);
    if (this.currentSlot !== currentSlot) {
      this.currentSlot = currentSlot;
      this.currentBucket = { t: 0, i: 0, o: 0, p: 0, f: 0, s: 0 };
      this.auditData.push(this.currentBucket);
    }
    this.updateCurrentBucket(currentSlot, bytesIn, bytesOut, success);
    this.cleanStaleData();
  }
  
  updateCurrentBucket(currentSlot: number, bytesIn: number, bytesOut: number, success: boolean) {
    this.currentBucket.t = currentSlot * REPORT_INTERVAL;
    this.currentBucket.i += bytesIn;
    this.currentBucket.o += bytesOut;
    this.currentBucket.p += 1;
    this.currentBucket.f += success ? 0 : 1;
    this.currentBucket.s += success ? 1 : 0;
  }

  cleanStaleData() {
    const oneHourAgo = Date.now() - 3600000;
    this.auditData = this.auditData.filter(data => data.t >= oneHourAgo);
  }  

  report(): QuorumProfile {
    this.cleanStaleData();
    return { ...this.getReportHeader(), d: this.auditData };
  }

  reportNow(): QuorumProfile {
    const currentTimestamp = Date.now();
    const fiveSecondsAgo = currentTimestamp - REPORT_INTERVAL;
      const currentWindowData = this.auditData.filter((data) => {
      return data.t >= fiveSecondsAgo && data.t <= currentTimestamp;
    });
    return { ...this.getReportHeader(), d: currentWindowData };
  }

  getReportHeader(): QuorumProfile {
    return {
      status: this.shouldConsume ? 'active' : 'inactive',
      namespace: this.namespace,
      appId: this.appId,
      guid: this.guid,
      topic: this.topic,
      role: this.role,
      throttle: this.throttle,
    } as QuorumProfile;
  }

  setThrottle(delayInMillis: number) {
    if (!Number.isInteger(delayInMillis) || delayInMillis < 0) {
      throw new Error('Throttle must be a non-negative integer');
    }
    this.throttle = delayInMillis;
    this.logger.info(`stream-throttle-reset`, { delay: this.throttle, topic: this.topic });
  }

  async claimUnacknowledgedMessages(stream: string, group: string, consumer: string, idleTimeMs = this.xclaim, limit = XPENDING_COUNT): Promise<[string, [string, string]][]> {
    let pendingMessages = [];
    const pendingMessagesInfo = await this.stream.xpending(stream, group, '-', '+', limit); //[[ '1688768134881-0', 'testConsumer1', 1017, 1 ]]
    for (const pendingMessageInfo of pendingMessagesInfo) {
      if (Array.isArray(pendingMessageInfo)) {
        const [id, , elapsedTimeMs] = pendingMessageInfo;
        if (elapsedTimeMs > idleTimeMs) {
          const message = await this.stream.xclaim(stream, group, consumer, idleTimeMs, id);
          pendingMessages = pendingMessages.concat(message);
        }
      }
    }
    return pendingMessages;
  }
}

export { StreamSignaler };
