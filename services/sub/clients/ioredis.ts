import { KeyService, KeyStoreParams, KeyType, PSNS } from '../../../modules/key';
import { ILogger } from '../../logger';
import { SubService } from '../index';
import { RedisClientType, RedisMultiType } from '../../../types/ioredisclient';
import { SubscriptionCallback } from '../../../types/quorum';

class IORedisSubService extends SubService<RedisClientType, RedisMultiType> {
  redisClient: RedisClientType;
  namespace: string;
  logger: ILogger;
  appId: string

  constructor(redisClient: RedisClientType) {
    super(redisClient);
  }

  async init(namespace = PSNS, appId: string, engineId: string, logger: ILogger): Promise<void> {
    this.namespace = namespace;
    this.logger = logger;
    this.appId = appId;
  }

  getMulti(): RedisMultiType {
    return this.redisClient.multi();
  }

  mintKey(type: KeyType, params: KeyStoreParams): string {
    if (!this.namespace) throw new Error('namespace not set');
    return KeyService.mintKey(this.namespace, type, params);
  }

  async subscribe(keyType: KeyType.QUORUM, callback: SubscriptionCallback, appId: string, engineId?: string): Promise<void> {
    const self = this;
    const topic = this.mintKey(keyType, { appId, engineId });
    await this.redisClient.subscribe(topic, (err) => {
      if (err) {
        self.logger.error(`Error subscribing to: ${topic}`, err);
      }
    });
    this.redisClient.on('message', (channel, message) => {
      if (channel === topic) {
        try {
          const payload = JSON.parse(message);
          callback(topic, payload);
        } catch (e) {
          self.logger.error(`Error parsing message: ${message}`, e);
        }
      }
    });
  }

  async unsubscribe(keyType: KeyType.QUORUM, appId: string, engineId?: string): Promise<void> {
    const topic = this.mintKey(keyType, { appId, engineId });
    await this.redisClient.unsubscribe(topic);
  }

  // async publish(keyType: KeyType.QUORUM, message: Record<string, any>, appId: string, engineId?: string): Promise<void> {
  //   const topic = this.mintKey(keyType, { appId, engineId });
  //   await this.redisClient.publish(topic, JSON.stringify(message));
  // }
}

export { IORedisSubService };
