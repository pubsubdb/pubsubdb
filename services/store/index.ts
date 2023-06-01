import { KeyStoreParams, KeyType } from '../../modules/key';
import { ILogger } from '../logger';
import { Cache } from './cache';
import { ActivityDataType, ActivityType } from '../../typedefs/activity';
import { AppVersion } from '../../typedefs/app';
import { SubscriptionCallback } from '../../typedefs/conductor';
import { HookRule, HookSignal } from '../../typedefs/hook';
import { JobActivityContext, JobData, JobMetadata, JobOutput } from '../../typedefs/job';
import { PubSubDBApp, PubSubDBApps, PubSubDBSettings } from '../../typedefs/pubsubdb';
import { IdsData, JobStatsRange, StatsType } from '../../typedefs/stats';
import { Transitions } from '../../typedefs/transition';

abstract class StoreService<T, U> {
  redisClient: T;
  cache: Cache;
  namespace: string;
  logger: ILogger;

  constructor(redisClient: T) {
    this.redisClient = redisClient;
  }

  abstract init(namespace: string, appId: string, logger: ILogger): Promise<PubSubDBApps>;
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
  abstract getJobMetadata(jobId: string, appVersion: AppVersion): Promise<JobMetadata | undefined>;
  abstract getJobOutput(jobId: string, appVersion: AppVersion): Promise<JobOutput | undefined>;
  abstract getJobData(jobId: string, appVersion: AppVersion): Promise<JobData | undefined>;
  abstract getJob(jobId: string, appVersion: AppVersion): Promise<JobData | undefined>;
  abstract setActivity(jobId: string, activityId: any, data: Record<string, unknown>, metadata: Record<string, unknown>, hook: null | Record<string, unknown>, config: AppVersion, multi? : U): Promise<any|string>
  abstract setActivityNX(jobId: string, activityId: any, config: AppVersion): Promise<number>
  abstract restoreContext(jobId: string, dependsOn: Record<string, string[]>, config: AppVersion): Promise<Partial<JobActivityContext>>;
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
  abstract addTaskQueues(keys: string[], appVersion: AppVersion): Promise<void>;
  abstract getActiveTaskQueue(appVersion: AppVersion): Promise<string | null>;
  abstract processTaskQueue(id: string, newListKey: string): Promise<any>;
  abstract deleteProcessedTaskQueue(workItemKey: string, key: string, processedKey: string, appVersion: AppVersion): Promise<void>;
  abstract ping(): Promise<string>;

  //store is responsible for `publish` (BUT NOT `subscribe` which is readonly!)
  abstract publish(keyType: KeyType.CONDUCTOR, message: Record<string, any>, appId: string, engineId?: string): Promise<void>;

  //store is responsible for non-blocking stream ops (BUT NOT `xreadgroup` which BLOCKS!)
  abstract xgroup(
    command: 'CREATE',
    key: string,
    groupName: string,
    id: string,
    mkStream?: 'MKSTREAM'): Promise<boolean>;
  abstract xadd(key: string, id: string, ...args: string[]): Promise<string>;
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
  abstract xack(key: string, group: string, id: string, multi?: U): Promise<number|U>;
  abstract xdel(key: string, id: string, multi?: U): Promise<number|U>;
}

export { StoreService };
