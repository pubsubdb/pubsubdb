import packageJson from '../../package.json';
import { KeyType } from '../../modules/key';
import { XSleepFor, sleepFor } from '../../modules/utils';
import { ILogger } from '../logger';
import { StoreService } from '../store';
import { StreamService } from '../stream';
import { RedisClient, RedisMulti } from '../../types/redis';
import { StringAnyType } from '../../types/serializer';
import {
  StreamConfig,
  StreamData,
  StreamDataResponse,
  StreamError,
  StreamRole,
  StreamStatus
} from '../../types/stream';
import {
  context,
  Context,
  Span,
  SpanContext,
  SpanKind,
  SpanStatusCode,
  trace } from '../../types/telemetry';

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

  async publishMessage(topic: string, streamData: StreamData|StreamDataResponse): Promise<string> {
    const stream = this.store.mintKey(KeyType.STREAMS, { appId: this.store.appId, topic });
    return await this.store.xadd(stream, '*', 'message', JSON.stringify(streamData));
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

        // Check for pending messages (note: Redis 6.2 simplifies)
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
        this.logger.error(`stream-consume-message-error`, { err, stream, group, consumer });
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
    const leg = group === 'WORKER' ? 1 : 2;
    const span = this.startSpan(leg, input);
    let output: StreamDataResponse | void;
    try {
      output = await this.execStreamLeg(input, stream, id, callback.bind(this));
      if (output?.status === StreamStatus.ERROR) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: `Function Status Code ${ output.code || UNKNOWN_STATUS_CODE }` });
      }
      this.errorCount = 0;
    } catch (err) {
      this.logger.error(`stream-consume-one-message-error`, { err, id, stream, group });
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    }
    const messageId = await this.publishResponse(input, output);
    span.setAttribute('app.worker.mid', messageId);
    await this.ackAndDelete(stream, group, id);
    this.endSpan(span);
  }

  async execStreamLeg(input: StreamData, stream: string, id: string, callback: (streamData: StreamData) => Promise<StreamDataResponse|void>) {
    let output: StreamDataResponse | void;
    try {
      output = await callback(input);
    } catch (err) {
      this.logger.error(`stream-call-function-error`, { err, id, stream });
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

  async publishResponse(input: StreamData, output: StreamDataResponse | void): Promise<string> {
    if (output && typeof output === 'object') {
      if (output.status === 'error') {
        const [shouldRetry, timeout] = this.shouldRetry(input, output);
        if (shouldRetry) {
          await sleepFor(timeout);
          return await this.publishMessage(input.metadata.topic, { 
            data: input.data,
            metadata: { ...input.metadata, try: (input.metadata.try || 0) + 1 },
            policies: input.policies,
          });
        } else {
          output = this.structureError(input, output);
        }
      }
      return await this.publishMessage(null, output as StreamDataResponse);
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

  startSpan(leg: number, input: StreamData): Span {
    const tracer = trace.getTracer(packageJson.name, packageJson.version);
    let parentContext = this.getParentSpanContext(input);
    const spanName = `FUNCTION/${this.appId}/${input.metadata.aid}/${input.metadata.topic}/${leg}`;
    const span = tracer.startSpan(
      spanName,
      { kind: SpanKind.CLIENT, attributes: this.getSpanAttrs(input), root: !parentContext },
      parentContext
    );
    return span;
  }

  endSpan(span?: Span): void {
    span && span.end();
  }

  getParentSpanContext(input: StreamData): undefined | Context {
    const restoredSpanContext: SpanContext = {
      traceId: input.metadata.trc,
      spanId: input.metadata.spn,
      isRemote: true,
      traceFlags: 1, // (todo: revisit sampling strategy/config)
    };
    const parentContext = trace.setSpanContext(context.active(), restoredSpanContext);
    return parentContext;
  }

  getSpanAttrs(input: StreamData): StringAnyType {
    return {
      ...Object.keys(input.metadata).reduce((result, key) => {
        if (key !== 'trc' && key !== 'spn') {
          result[`app.worker.${key}`] = input.metadata[key];
        }
        return result;
      }, {})
    };
  };
}

export { StreamSignaler };
