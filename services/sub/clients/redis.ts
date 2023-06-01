import { KeyService, KeyStoreParams, KeyType, PSNS } from '../../../modules/key';
import { ILogger } from '../../logger';
import { SubService } from '../index';
import { AppVersion } from '../../../typedefs/app';
import { SubscriptionCallback } from '../../../typedefs/conductor';
import { RedisClientType, RedisMultiType } from '../../../typedefs/redisclient';

class RedisSubService extends SubService<RedisClientType, RedisMultiType> {
  redisClient: RedisClientType;
  namespace: string;
  logger: ILogger;
  appId: string;

  constructor(redisClient: RedisClientType) {
    super(redisClient);
  }

  async init(namespace = PSNS, appId: string, engineId: string, logger: ILogger, callback: SubscriptionCallback): Promise<void> {
    this.namespace = namespace;
    this.logger = logger;
    this.appId = appId;
    await this.subscribe(KeyType.CONDUCTOR, callback, appId);
    await this.subscribe(KeyType.CONDUCTOR, callback, appId, engineId);
  }

  getMulti(): RedisMultiType {
    const multi = this.redisClient.MULTI();
    return multi as unknown as RedisMultiType;
  }

  mintKey(type: KeyType, params: KeyStoreParams): string {
    if (!this.namespace) throw new Error('namespace not set');
    return KeyService.mintKey(this.namespace, type, params);
  }

  async subscribe(keyType: KeyType.CONDUCTOR, callback: SubscriptionCallback, appId: string, engineId?: string): Promise<void> {
    if (this.redisClient) {
      const self = this;
      const topic = this.mintKey(keyType, { appId, engineId });
      await this.redisClient.subscribe(topic, (message) => {
        try {
          const payload = JSON.parse(message);
          callback(topic, payload);
        } catch (e) {
          self.logger.error(`Error parsing message: ${message}`, e);
        }
      });
    }
  }

  async unsubscribe(keyType: KeyType.CONDUCTOR, appId: string, engineId?: string): Promise<void> {
    const topic = this.mintKey(keyType, { appId, engineId });
    await this.redisClient.unsubscribe(topic);
  }

  // async publish(keyType: KeyType.CONDUCTOR, message: Record<string, any>, appId: string, engineId?: string): Promise<void> {
  //   const topic = this.mintKey(keyType, { appId, engineId });
  //   this.redisClient.publish(topic, JSON.stringify(message));
  // }
}

export { RedisSubService };
