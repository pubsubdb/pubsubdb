import { StatsType } from "../../typedefs/stats";

abstract class StoreService {
  abstract init(namespace: string, appId: string): Promise<any>;
  abstract getSettings(bCreate?: boolean): Promise<any>;
  abstract setSettings(manifest: Record<string, unknown>): Promise<any>;
  abstract getApps(): Promise<{[appId: string]: any}>;
  abstract getApp(appId: string): Promise<any>;
  abstract setApp(appId: string, appVersion: string): Promise<any>;
  abstract activateAppVersion(appId: string, version: string): Promise<any>;
  abstract setJob(jobId: any, data: Record<string, unknown>, metadata: Record<string, unknown>, config: any): Promise<any>;
  abstract setJobStats(jobKey: string, jobId: string, stats: StatsType, appConfig: {id: string, version: string}): Promise<string>
  abstract getJobMetadata(jobId: string, config: any): Promise<any>;
  abstract getJobData(jobId: string, config: any): Promise<any>;
  abstract getJob(jobId: string, config: any): Promise<any>;
  abstract get(jobId: string, config: any): Promise<any>;
  abstract setActivity(jobId: string, activityId: any, data: Record<string, unknown>, metadata: Record<string, unknown>, config: any): Promise<any>;
  abstract getActivityMetadata(jobId: string, activityId: string, config: any): Promise<any>;
  abstract getActivityData(jobId: string, activityId: string, config: any): Promise<any>;
  abstract getActivity(jobId: string, activityId: string, config: any): Promise<any>;
  abstract getSchema(activityId: string, config: any): Promise<any>;
  abstract getSchemas(config: any): Promise<any>;
  abstract setSchemas(schemas: Record<string, any>, config: any): Promise<any>;
  abstract setSubscriptions(subscriptions: Record<string, any>, config: any): Promise<any>;
  abstract getSubscription(topic: string, config: any): Promise<string | undefined>;
  abstract setSubscriptionPatterns(subscriptionsPatterns: Record<string, any>, config: any): Promise<any>;
  abstract getSubscriptionPatterns(config: any): Promise<any>;
}

export { StoreService };
