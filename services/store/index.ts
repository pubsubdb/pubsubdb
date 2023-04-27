import { AppVersion } from '../../typedefs/app';
import { Signal } from '../../typedefs/signal';
import { IdsData, JobStatsRange, StatsType } from '../../typedefs/stats';
import { ILogger } from '../logger';
import { Cache } from './cache';
import { KeyStoreParams, KeyType } from './key';
import { PubSubDBApp, PubSubDBSettings } from '../../typedefs/pubsubdb';
import { RedisClientType, RedisMultiType } from '../../typedefs/redis';
import {
  RedisMultiType as IORedisMultiType,
  RedisClientType as IORedisClientType
} from '../../typedefs/ioredis';
import { SubscriptionCallback } from '../../typedefs/conductor';

abstract class StoreService {
  redisClient: RedisClientType | IORedisClientType | any;
  redisSubscriber: RedisClientType | IORedisClientType | any;
  cache: Cache;
  namespace: string;
  logger: ILogger;

  abstract init(namespace: string, appId: string, logger: ILogger): Promise<{[appId: string]: PubSubDBApp}>;
  abstract getSettings(bCreate?: boolean): Promise<PubSubDBSettings>;
  abstract setSettings(manifest: Record<string, unknown>): Promise<any>;
  abstract getMulti(): RedisMultiType | IORedisMultiType | any;
  abstract mintKey(type: KeyType, params: KeyStoreParams): string;
  abstract getApp(appId: string, refresh?: boolean): Promise<PubSubDBApp>;
  abstract setApp(appId: string, appVersion: string): Promise<any>;
  abstract activateAppVersion(appId: string, version: string): Promise<any>;
  abstract setJob(jobId: any, data: Record<string, unknown>, metadata: Record<string, unknown>, config: AppVersion, multi? : any): Promise<any|string>;
  abstract setJobStats(jobKey: string, jobId: string, dateTime: string, stats: StatsType, appVersion: AppVersion, multi? : any): Promise<any|string>;
  abstract getJobStats(jobKeys: string[], config: AppVersion): Promise<JobStatsRange>;
  abstract getJobIds(indexKeys: string[], config: AppVersion): Promise<IdsData>;
  abstract updateJobStatus(jobId: string, collationKeyStatus: number, appVersion: AppVersion, multi? : any): Promise<any>
  abstract getJobMetadata(jobId: string, config: AppVersion): Promise<any>;
  abstract getJobData(jobId: string, config: AppVersion): Promise<any>;
  abstract getJob(jobId: string, config: AppVersion): Promise<any>;
  abstract get(jobId: string, config: AppVersion): Promise<any>;
  abstract setActivity(jobId: string, activityId: any, data: Record<string, unknown>, metadata: Record<string, unknown>, config: AppVersion, multi? : any): Promise<any|string>
  abstract setActivityNX(jobId: string, activityId: any, config: AppVersion): Promise<number>
  abstract getActivityMetadata(jobId: string, activityId: string, config: AppVersion): Promise<any>;
  abstract getActivityData(jobId: string, activityId: string, config: AppVersion): Promise<any>;
  abstract getActivity(jobId: string, activityId: string, config: AppVersion): Promise<any>;
  abstract getSchema(activityId: string, config: AppVersion): Promise<any>;
  abstract getSchemas(config: AppVersion): Promise<any>;
  abstract setSchemas(schemas: Record<string, any>, config: AppVersion): Promise<any>;
  abstract setSubscriptions(subscriptions: Record<string, any>, config: AppVersion): Promise<any>;
  abstract getSubscription(topic: string, config: AppVersion): Promise<string | undefined>;
  abstract setTransitions(subscriptionsPatterns: Record<string, any>, config: AppVersion): Promise<any>;
  abstract getTransitions(config: AppVersion): Promise<any>;
  abstract setHookPatterns(hookPatterns: { [key: string]: string }, config: AppVersion): Promise<any>;
  abstract getHookPatterns(config: AppVersion): Promise<Record<string, unknown>>;
  abstract setSignal(signal: Signal, appVersion: AppVersion, multi? : any): Promise<any>;
  abstract getSignal(topic: string, resolved: string, appVersion: AppVersion): Promise<Signal | undefined>;
  abstract subscribe(keyType: KeyType.CONDUCTOR, subscriptionHandler: SubscriptionCallback, appVersion: AppVersion): Promise<void>;
  abstract publish(keyType: KeyType.CONDUCTOR, message: Record<string, any>, appVersion: AppVersion): Promise<void>;
}

export { StoreService };
