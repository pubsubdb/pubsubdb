import { KeyStoreParams, KeyType } from '../../modules/key';
import { ILogger } from '../logger';
import { AppVersion } from '../../typedefs/app';
import { SubscriptionCallback } from '../../typedefs/conductor';

abstract class SubService<T, U> {
  redisClient: T;
  namespace: string;
  logger: ILogger;

  constructor(redisClient: T) {
    this.redisClient = redisClient;
  }

  abstract init(namespace: string, appId: string, engineId: string, logger: ILogger, callback: SubscriptionCallback): Promise<void>;
  abstract getMulti(): U;
  abstract mintKey(type: KeyType, params: KeyStoreParams): string;
  abstract subscribe(keyType: KeyType.CONDUCTOR, callback: SubscriptionCallback, appId: string, engineId?: string): Promise<void>;
  abstract unsubscribe(keyType: KeyType.CONDUCTOR, appId: string, engineId?: string): Promise<void>;
  //abstract publish(keyType: KeyType.CONDUCTOR, message: Record<string, any>, appId: string, engineId?: string): Promise<void>;
}

export { SubService };
