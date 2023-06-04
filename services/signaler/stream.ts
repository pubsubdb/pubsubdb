import { KeyType } from '../../modules/key';
import { sleepFor } from '../../modules/utils';
import { ILogger } from '../logger';
import { StreamService } from '../stream';
import { RedisClient, RedisMulti } from '../../typedefs/redis';
import { StreamData, StreamDataResponse } from '../../typedefs/stream';

import { StoreService } from '../store';
import { QuorumProcessed, QuorumProfile } from '../../typedefs/quorum';

const MAX_TIMEOUT_MS = 60000;
const GRADUATED_INTERVAL_MS = 5000;
//Set to `15` so SIGINT/SIGTERM can interrupt; set to `0` to BLOCK indefinitely
const BLOCK_DURATION = 15000;
//Set to `1000` so tests can interrupt quickly
const TEST_BLOCK_DURATION = 1000;
const BLOCK_TIME_MS = process.env.NODE_ENV === 'test' ? TEST_BLOCK_DURATION : BLOCK_DURATION;

class StreamSignaler {
  namespace: string;
  appId: string;
  guid: string;
  store: StoreService<RedisClient, RedisMulti>;
  stream: StreamService<RedisClient, RedisMulti>;
  logger: ILogger;
  throttle = 0;
  currentSlot: number | null = null;
  currentBucket: QuorumProcessed | null = null;
  auditData: QuorumProcessed[] = [];

  static shouldConsume: boolean;
  static signalers: Set<StreamSignaler> = new Set();

  constructor(namespace: string, appId: string, guid: string, stream: StreamService<RedisClient, RedisMulti>, store: StoreService<RedisClient, RedisMulti>, logger: ILogger) {
    this.namespace = namespace;
    this.appId = appId;
    this.guid = guid;
    this.stream = stream;
    this.store = store;
    this.logger = logger;
  }

  async createGroup(streamName: string, groupName: string) {
    try {
      await this.store.xgroup('CREATE', streamName, groupName, '$', 'MKSTREAM');
    } catch (err) {
      this.logger.warn('BUSYGROUP Consumer Group name already exists', { streamName, groupName });
    }
  }

  async publishMessage(streamName: string, streamData: StreamData|StreamDataResponse) {
    await this.store.xadd(streamName, '*', 'message', JSON.stringify(streamData));
  }

  async consumeMessages(streamName: string, groupName: string, consumerName: string, callback: (streamData: StreamData) => Promise<StreamDataResponse|void>): Promise<void> {
    StreamSignaler.signalers.add(this);
    StreamSignaler.shouldConsume = true;
    this.logger.info(`Consuming Messages: ${streamName} ${groupName} ${consumerName}`);
    await this.createGroup(streamName, groupName);
    let errorCount = 0;
    // Recursively call consume() to get the next message
    async function consume() {
      if (!StreamSignaler.shouldConsume) {
        this.logger.info(`Stopping Stream Consumer: ${groupName} ${consumerName} ${streamName}`);
        return;
      }
      try {
        const result = await this.stream.xreadgroup(
          'GROUP',
          groupName,
          consumerName,
          'BLOCK',
          BLOCK_TIME_MS,
          'STREAMS',
          streamName,
          '>'
        );
        if (Array.isArray(result) && Array.isArray(result[0])) {
          const [[, messages]] = result;
          for (const [id, message] of messages) {
            try {
              await this.doSomeWork(id, message, streamName, groupName, callback.bind(this));
              //reset the error count if successful
              errorCount = 0;
            } catch (err) {
              //worker or engine should never throw an error; todo: `policy` service
              this.logger.error(`Error processing message: ${id} in stream: ${streamName}`, err);
            }
          }
        }
        // Recursively call consume() to get the next message
        setImmediate(consume.bind(this));
      } catch (err) {
        if (!StreamSignaler.shouldConsume) {
          this.logger.info(`Stopping Stream Consumer: ${groupName} ${consumerName} ${streamName}`);
        } else if (process.env.NODE_ENV === 'test') {
          this.logger.info('Stream Consumer Manually Interrupted (The Test Successfully Concluded)');
        } else {
          this.logger.error(`Error reading from stream: ${streamName}`, err);
          errorCount++;
          const timeout = Math.min(GRADUATED_INTERVAL_MS * (2 ** errorCount), MAX_TIMEOUT_MS);
          setTimeout(consume.bind(this), timeout);
        }
      }
    }
    consume.call(this);
  }

  async doSomeWork(id: string, message: string[], streamName: string, groupName: string, callback: (streamData: StreamData) => Promise<StreamDataResponse|void>) {
    this.logger.info(`Received message: ${id}`);
    const streamData: StreamData = JSON.parse(message[1]);
    //await worker function and then AUDIT the data flow
    const streamDataResponse = await callback(streamData);
    const bytesIn = Buffer.byteLength(message[1], 'utf8');
    const bytesOut = streamDataResponse ? Buffer.byteLength(JSON.stringify(streamDataResponse), 'utf8') : 0;
    this.audit(bytesIn, bytesOut, true);
    //if worker function returns a message, call `publishMessage` on their behalf;
    //otherwise, worker must manually call 'publishMessage' to complete the round trip
    if (streamDataResponse) {
      const key = this.stream.mintKey(KeyType.STREAMS, { appId: this.appId });
      this.publishMessage(key, streamDataResponse as StreamDataResponse);
    }
    /////// MULTI: START ///////
    const multi = this.stream.getMulti();
    await this.stream.xack(streamName, groupName, id, multi);
    await this.stream.xdel(streamName, id, multi);
    multi.exec();
    //////// MULTI: END ////////
    await sleepFor(this.throttle);
  }
  
  static async stopConsuming() {
    //iterate the set of signalers and ping each one to stop consuming
    StreamSignaler.shouldConsume = false;
    for (const signaler of [...StreamSignaler.signalers]) {
      signaler.logger.info('Stopping Stream Consumer');
    }
    await sleepFor(BLOCK_TIME_MS); //wait for all blocking calls to return
  }

  audit(bytesIn: number, bytesOut: number, success: boolean) {
    const currentTimestamp = Date.now();
    const currentSlot = Math.floor(currentTimestamp / 5000);
    if (this.currentSlot === currentSlot) {
      this.currentBucket.t = currentSlot * 5000;
      this.currentBucket.i += bytesIn;
      this.currentBucket.o += bytesOut;
      this.currentBucket.p += 1;
      this.currentBucket.f += success ? 0 : 1;
      this.currentBucket.s += success ? 1 : 0;
    } else {
      this.currentSlot = currentSlot;
      this.currentBucket = {
        t: currentSlot * 5000,
        i: bytesIn,
        o: bytesOut,
        p: 1,
        f: success ? 0 : 1,
        s: success ? 1 : 0
      };
      this.auditData.push(this.currentBucket);
    }
    this.cleanOldData();
  }

  cleanOldData() {
    const oneHourAgo = Date.now() - 3600000;
    this.auditData = this.auditData.filter(data => data.t >= oneHourAgo);
  }  

  report(): QuorumProfile {
    this.cleanOldData();
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

  setThrottle(delayInMillis: number) {
    if (!Number.isInteger(delayInMillis) || delayInMillis < 0) {
      throw new Error('Throttle must be a non-negative integer');
    }
    this.throttle = delayInMillis;
  }

  async claimUnacknowledgedMessages(streamName: string, groupName: string, newConsumerName: string, idleTimeMs: number) {
    const [firstId, , count] = await this.store.xpending(streamName, groupName);
    if (typeof count === 'number') {    
      if (count > 0) {
        const pendingMessages = await this.store.xpending(streamName, groupName, firstId.toString(), '+', count);
        for (const pendingMessage of pendingMessages) {
          if (Array.isArray(pendingMessage)) {
            const [id, consumerName, elapsedTimeMs] = pendingMessage;
            if (elapsedTimeMs > idleTimeMs) {
              this.logger.info(`Reclaiming message ${id} from ${consumerName}`);
              await this.store.xclaim(streamName, groupName, newConsumerName, idleTimeMs, id);
            }
          }
        }
      }
    }
  }
}

export { StreamSignaler };
