import { AppVersion } from '../../typedefs/app';
import { Signal } from '../../typedefs/signal';
import { JobStatsRange, StatsType } from '../../typedefs/stats';
import { ILogger } from '../logger';
import { KeyStore, KeyStoreParams } from './keyStore';
import { ChainableCommander } from 'ioredis';
import { RedisMultiType } from '../../typedefs/redis';

abstract class StoreService {
  abstract init(namespace: string, appId: string, logger: ILogger): Promise<any>;
  abstract getSettings(bCreate?: boolean): Promise<any>;
  abstract setSettings(manifest: Record<string, unknown>): Promise<any>;
  abstract getMulti(): RedisMultiType | ChainableCommander;
  abstract mintKey(type: KeyStore, params: KeyStoreParams): string;
  abstract getApps(): Promise<{[appId: string]: any}>;
  abstract getApp(appId: string): Promise<any>;
  abstract setApp(appId: string, appVersion: string): Promise<any>;
  abstract activateAppVersion(appId: string, version: string): Promise<any>;
  abstract setJob(jobId: any, data: Record<string, unknown>, metadata: Record<string, unknown>, config: AppVersion, multi? : any): Promise<any|string>
  abstract setJobStats(jobKey: string, jobId: string, dateTime: string, stats: StatsType, appVersion: AppVersion, multi? : any): Promise<any|string>
  abstract getJobStats(jobKeys: string[], config: AppVersion): Promise<JobStatsRange>
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
}

export { StoreService };
