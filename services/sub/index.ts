import { KeyStoreParams, KeyType } from '../../modules/key';
import { ILogger } from '../logger';
import { SubscriptionCallback } from '../../typedefs/quorum';

abstract class SubService<T, U> {
  redisClient: T;
  namespace: string;
  logger: ILogger;
  appId: string;

  constructor(redisClient: T) {
    this.redisClient = redisClient;
  }

  abstract init(namespace: string, appId: string, engineId: string, logger: ILogger): Promise<void>;
  abstract getMulti(): U;
  abstract mintKey(type: KeyType, params: KeyStoreParams): string;
  abstract subscribe(keyType: KeyType.QUORUM, callback: SubscriptionCallback, appId: string, engineId?: string): Promise<void>;
  abstract unsubscribe(keyType: KeyType.QUORUM, appId: string, engineId?: string): Promise<void>;
  //abstract publish(keyType: KeyType.QUORUM, message: Record<string, any>, appId: string, engineId?: string): Promise<void>;
}

export { SubService };
