import { AppVersion } from '../../typedefs/app';
import { Signal } from '../../typedefs/signal';
import { StatsType } from '../../typedefs/stats';

abstract class StoreService {
  abstract init(namespace: string, appId: string): Promise<any>;
  abstract getSettings(bCreate?: boolean): Promise<any>;
  abstract setSettings(manifest: Record<string, unknown>): Promise<any>;
  abstract getApps(): Promise<{[appId: string]: any}>;
  abstract getApp(appId: string): Promise<any>;
  abstract setApp(appId: string, appVersion: string): Promise<any>;
  abstract activateAppVersion(appId: string, version: string): Promise<any>;
  abstract setJob(jobId: any, data: Record<string, unknown>, metadata: Record<string, unknown>, config: AppVersion): Promise<any>;
  abstract setJobStats(jobKey: string, jobId: string, dateTime: string, stats: StatsType, appConfig: {id: string, version: string}): Promise<string>
  abstract getJobMetadata(jobId: string, config: AppVersion): Promise<any>;
  abstract getJobData(jobId: string, config: AppVersion): Promise<any>;
  abstract getJob(jobId: string, config: AppVersion): Promise<any>;
  abstract get(jobId: string, config: AppVersion): Promise<any>;
  abstract setActivity(jobId: string, activityId: any, data: Record<string, unknown>, metadata: Record<string, unknown>, config: AppVersion): Promise<any>;
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
  abstract setSignal(signal: Signal, appVersion: AppVersion): Promise<any>;
  abstract getSignal(topic: string, resolved: string, appVersion: AppVersion): Promise<Signal | undefined>;
}

export { StoreService };
