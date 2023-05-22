import { ILogger } from '../logger';
import { PubSubDBService as PubSubDB } from '../pubsubdb';
import { StoreService } from '../store';
import { AppVersion } from '../../typedefs/app';
import { HookRule, HookSignal } from '../../typedefs/hook';
import { JobContext } from '../../typedefs/job';
import { RedisClient, RedisMulti } from '../../typedefs/store';
import { StreamData, StreamDataResponse } from '../../typedefs/stream';
import { KeyType } from '../store/key';

const MAX_TIMEOUT_MS = 60000;
const GRADUATED_INTERVAL_MS = 5000;

class SignalerService {
  store: StoreService<RedisClient, RedisMulti>;
  logger: ILogger;
  appVersion: AppVersion;
  pubsubdb: PubSubDB;
  private shouldConsume: boolean;

  constructor(appVersion: AppVersion, store: StoreService<RedisClient, RedisMulti>, logger: ILogger, pubsubdb: PubSubDB) {
    this.appVersion = appVersion;
    this.logger = logger;
    this.store = store;
    this.pubsubdb = pubsubdb;
  }

  async getHookRule(topic: string): Promise<HookRule | undefined> {
    const rules = await this.store.getHookRules(await this.pubsubdb.getAppConfig());
    return rules?.[topic]?.[0] as HookRule;
  }

  async registerHook(topic: string, context: JobContext, multi?: RedisMulti): Promise<string> {
    const hookRule = await this.getHookRule(topic);
    if (hookRule) {
      const jobId = context.metadata.jid;
      const hook: HookSignal = {
        topic,
        resolved: jobId,
        jobId,
      }
      await this.store.setHookSignal(hook, this.appVersion, multi);
      return jobId;
    } else {
      throw new Error('signaler.registerHook:error: hook rule not found');
    }
  }

  async process(topic: string, data: Record<string, unknown>): Promise<string> {
    const hookRule = await this.getHookRule(topic);
    if (hookRule) {
      //todo: use the rule to generate `resolved`
      const resolved = (data as { id: string}).id;
      const jobId = await this.store.getHookSignal(topic, resolved, this.appVersion);
      return jobId;
    } else {
      throw new Error('signaler.process:error: hook rule not found');
    }
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
    this.shouldConsume = true;
    this.logger.info(`Consuming Messages: ${streamName} ${groupName} ${consumerName}`);
    await this.createGroup(streamName, groupName);
    let errorCount = 0;
    setTimeout(async () => {
      while (this.shouldConsume) {
        try {
          const result = await this.store.xreadgroup(
            'GROUP',
            groupName,
            consumerName,
            'BLOCK',
            //todo: this should be '0'; might be bug ioredis; try redis
            100,
            'STREAMS',
            streamName,
            '>'
          );
          if (Array.isArray(result) && Array.isArray(result[0])) {
            const [[, messages]] = result;
            for (const [id, message] of messages) {
              try {
                this.logger.info(`Received message: ${id}`);
                const streamData: StreamData = JSON.parse(message[1]);
                const streamDataResponse = await callback(streamData);
                if (streamDataResponse) {
                  const key = this.store?.mintKey(KeyType.STREAMS, { appId: this.pubsubdb.appId });
                  this.publishMessage(key, streamDataResponse as StreamDataResponse);
                }
                errorCount = 0;
                await this.store.xack(streamName, groupName, id);
                await this.store.xdel(streamName, id);
              } catch (err) {
                this.logger.error(`Error processing message: ${id} in stream: ${streamName}`, err);
              }
            }
          }
        } catch (err) {
          if (process.env.NODE_ENV === 'test') {
            break;
          }
          this.logger.error(`Error reading from stream: ${streamName}`, err);
          errorCount++;
          const timeout = Math.min(GRADUATED_INTERVAL_MS * (2 ** errorCount), MAX_TIMEOUT_MS);
          await new Promise(resolve => setTimeout(resolve, timeout));
        }
      }
    }, 0);
  }
  
  stopConsuming() {
    this.shouldConsume = false;
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

export { SignalerService };
