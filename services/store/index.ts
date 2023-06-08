import { KeyStoreParams, KeyType } from '../../modules/key';
import { ILogger } from '../logger';
import { Cache } from './cache';
import { ActivityDataType, ActivityType } from '../../typedefs/activity';
import { AppVID } from '../../typedefs/app';
import { HookRule, HookSignal } from '../../typedefs/hook';
import { JobActivityContext, JobData, JobMetadata, JobOutput } from '../../typedefs/job';
import { PubSubDBApp, PubSubDBApps, PubSubDBSettings } from '../../typedefs/pubsubdb';
import { IdsData, JobStatsRange, StatsType } from '../../typedefs/stats';
import { Transitions } from '../../typedefs/transition';

abstract class StoreService<T, U> {
  redisClient: T;
  cache: Cache;
  namespace: string;
  appId: string
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
  abstract activateAppVersion(appId: string, version: string): Promise<boolean>;
  abstract setJob(jobId: any, data: Record<string, unknown>, metadata: Record<string, unknown>, appVID: AppVID, multi? : U): Promise<any|string>;
  abstract setJobStats(jobKey: string, jobId: string, dateTime: string, stats: StatsType, appVersion: AppVID, multi? : U): Promise<any|string>;
  abstract getJobStats(jobKeys: string[]): Promise<JobStatsRange>;
  abstract getJobIds(indexKeys: string[], idRange: [number, number]): Promise<IdsData>;
  abstract updateJobStatus(jobId: string, collationKeyStatus: number, appVersion: AppVID, multi? : U): Promise<any>
  abstract getJobMetadata(jobId: string, appVersion: AppVID): Promise<JobMetadata | undefined>;
  abstract getJobOutput(jobId: string, appVersion: AppVID): Promise<JobOutput | undefined>;
  abstract getJobData(jobId: string, appVersion: AppVID): Promise<JobData | undefined>;
  abstract setActivity(jobId: string, activityId: any, data: Record<string, unknown>, metadata: Record<string, unknown>, hook: null | Record<string, unknown>, appVID: AppVID, multi? : U): Promise<any|string>
  abstract setActivityNX(jobId: string, activityId: any, appVID: AppVID): Promise<number>
  abstract restoreContext(jobId: string, dependsOn: Record<string, string[]>, appVID: AppVID): Promise<Partial<JobActivityContext>>;
  abstract getActivityMetadata(jobId: string, activityId: string, appVID: AppVID): Promise<any>;
  abstract getActivityContext(jobId: string, activityId: string, appVID: AppVID): Promise<ActivityDataType | null | undefined>;
  abstract getActivity(jobId: string, activityId: string, appVID: AppVID): Promise<Record<string, unknown> | null | undefined>;
  abstract getSchema(activityId: string, appVID: AppVID): Promise<ActivityType>;
  abstract getSchemas(appVID: AppVID): Promise<Record<string, ActivityType>>;
  abstract setSchemas(schemas: Record<string, ActivityType>, appVID: AppVID): Promise<any>;
  abstract setSubscriptions(subscriptions: Record<string, any>, appVID: AppVID): Promise<boolean>;
  abstract getSubscriptions(appVersion: AppVID): Promise<Record<string, string>>;
  abstract getSubscription(topic: string, appVID: AppVID): Promise<string | undefined>;
  abstract setTransitions(subscriptionsPatterns: Record<string, any>, appVID: AppVID): Promise<any>;
  abstract getTransitions(appVID: AppVID): Promise<Transitions>;
  abstract setHookRules(hookRules: Record<string, HookRule[]>): Promise<any>;
  abstract getHookRules(): Promise<Record<string, HookRule[]>>;
  abstract setHookSignal(hook: HookSignal, multi? : U): Promise<any>;
  abstract getHookSignal(topic: string, resolved: string): Promise<string | undefined>;
  abstract addTaskQueues(keys: string[]): Promise<void>;
  abstract getActiveTaskQueue(): Promise<string | null>;
  abstract processTaskQueue(id: string, newListKey: string): Promise<any>;
  abstract deleteProcessedTaskQueue(workItemKey: string, key: string, processedKey: string): Promise<void>;
  abstract ping(): Promise<string>;

  //store is responsible for `publish` (BUT NOT `subscribe` which is readonly!)
  abstract publish(keyType: KeyType.QUORUM, message: Record<string, any>, appId: string, engineId?: string): Promise<boolean>;

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
