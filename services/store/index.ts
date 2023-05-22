import { AppVersion } from '../../typedefs/app';
import { IdsData, JobStatsRange, StatsType } from '../../typedefs/stats';
import { ILogger } from '../logger';
import { Cache } from './cache';
import { KeyStoreParams, KeyType } from './key';
import { PubSubDBApp, PubSubDBSettings } from '../../typedefs/pubsubdb';
import { SubscriptionCallback } from '../../typedefs/conductor';
import { HookRule, HookSignal } from '../../typedefs/hook';
import { JobContext, JobData } from '../../typedefs/job';
import { ActivityDataType, ActivityType } from '../../typedefs/activity';
import { Transitions } from '../../typedefs/transition';

abstract class StoreService<T, U> {
  redisClient: T;
  redisSubscriber: T;
  redisStreamer: T;
  cache: Cache;
  namespace: string;
  logger: ILogger;

  constructor(
    redisClient: T, 
    redisSubscriber: T,
    redisStreamer: T,
  ) {
    this.redisClient = redisClient;
    this.redisSubscriber = redisSubscriber;
    this.redisStreamer = redisStreamer;
  }

  abstract init(namespace: string, appId: string, logger: ILogger): Promise<{[appId: string]: PubSubDBApp}>;
  abstract getSettings(bCreate?: boolean): Promise<PubSubDBSettings>;
  abstract setSettings(manifest: Record<string, unknown>): Promise<any>;
  abstract getMulti(): U;
  abstract mintKey(type: KeyType, params: KeyStoreParams): string;
  abstract getApp(appId: string, refresh?: boolean): Promise<PubSubDBApp>;
  abstract setApp(appId: string, appVersion: string): Promise<any>;
  abstract activateAppVersion(appId: string, version: string): Promise<any>;
  abstract setJob(jobId: any, data: Record<string, unknown>, metadata: Record<string, unknown>, config: AppVersion, multi? : U): Promise<any|string>;
  abstract setJobStats(jobKey: string, jobId: string, dateTime: string, stats: StatsType, appVersion: AppVersion, multi? : U): Promise<any|string>;
  abstract getJobStats(jobKeys: string[], config: AppVersion): Promise<JobStatsRange>;
  abstract getJobIds(indexKeys: string[], idRange: [number, number]): Promise<IdsData>;
  abstract updateJobStatus(jobId: string, collationKeyStatus: number, appVersion: AppVersion, multi? : U): Promise<any>
  abstract getJobMetadata(jobId: string, appVersion: AppVersion): Promise<object | undefined>;
  abstract getJobContext(jobId: string, appVersion: AppVersion): Promise<JobContext | undefined>;
  abstract getJobData(jobId: string, appVersion: AppVersion): Promise<object | undefined>;
  abstract getJob(jobId: string, appVersion: AppVersion): Promise<JobData | undefined>;
  abstract setActivity(jobId: string, activityId: any, data: Record<string, unknown>, metadata: Record<string, unknown>, hook: null | Record<string, unknown>, config: AppVersion, multi? : U): Promise<any|string>
  abstract setActivityNX(jobId: string, activityId: any, config: AppVersion): Promise<number>
  abstract restoreContext(jobId: string, dependsOn: Record<string, string[]>, config: AppVersion): Promise<Partial<JobContext>>;
  abstract getActivityMetadata(jobId: string, activityId: string, config: AppVersion): Promise<any>;
  abstract getActivityContext(jobId: string, activityId: string, config: AppVersion): Promise<ActivityDataType | null | undefined>;
  abstract getActivity(jobId: string, activityId: string, config: AppVersion): Promise<Record<string, unknown> | null | undefined>;
  abstract getSchema(activityId: string, config: AppVersion): Promise<ActivityType>;
  abstract getSchemas(config: AppVersion): Promise<Record<string, ActivityType>>;
  abstract setSchemas(schemas: Record<string, ActivityType>, config: AppVersion): Promise<any>;
  abstract setSubscriptions(subscriptions: Record<string, any>, config: AppVersion): Promise<any>;
  abstract getSubscriptions(appVersion: AppVersion): Promise<Record<string, string>>;
  abstract getSubscription(topic: string, config: AppVersion): Promise<string | undefined>;
  abstract setTransitions(subscriptionsPatterns: Record<string, any>, config: AppVersion): Promise<any>;
  abstract getTransitions(config: AppVersion): Promise<Transitions>;
  abstract setHookRules(hookRules: Record<string, HookRule[]>, config: AppVersion): Promise<any>;
  abstract getHookRules(config: AppVersion): Promise<Record<string, HookRule[]>>;
  abstract setHookSignal(hook: HookSignal, appVersion: AppVersion, multi? : U): Promise<any>;
  abstract getHookSignal(topic: string, resolved: string, appVersion: AppVersion): Promise<string | undefined>;
  abstract subscribe(keyType: KeyType.CONDUCTOR, subscriptionHandler: SubscriptionCallback, appVersion: AppVersion): Promise<void>;
  abstract publish(keyType: KeyType.CONDUCTOR, message: Record<string, any>, appVersion: AppVersion): Promise<void>;
  abstract addTaskQueues(keys: string[], appVersion: AppVersion): Promise<void>;
  abstract getActiveTaskQueue(appVersion: AppVersion): Promise<string | null>;
  abstract processTaskQueue(id: string, newListKey: string): Promise<any>;
  abstract deleteProcessedTaskQueue(workItemKey: string, key: string, processedKey: string, appVersion: AppVersion): Promise<void>;

  //XSTREAM methods
  abstract xgroup(
    command: 'CREATE',
    key: string,
    groupName: string,
    id: string,
    mkStream?: 'MKSTREAM'): Promise<boolean>;
  abstract xadd(key: string, id: string, ...args: string[]): Promise<string>;
  abstract xreadgroup(
    command: 'GROUP',
    groupName: string,
    consumerName: string,
    blockOption: 'BLOCK'|'COUNT',
    blockTime: number|string,
    streamsOption: 'STREAMS',
    streamName: string,
    id: string): Promise<string[][][] | null | unknown[]>;
  abstract xack(key: string, group: string, ...ids: string[]): Promise<number>;
  abstract xpending(
    key: string,
    group: string,
    start?: string,
    end?: string,
    count?: number,
    consumer?: string): Promise<[string, string, number, [string, number][]][] | [string, string, number, number] | unknown[]>;
  abstract xclaim(
      key: string,
      group: string,
      consumer: string,
      minIdleTime: number,
      id: string,
      ...args: string[]): Promise<[string, string][] | unknown[]>;
  abstract xdel(key: string, ...ids: string[]): Promise<number>;

}

export { StoreService };
