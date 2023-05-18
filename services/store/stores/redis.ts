import { Cache } from '../cache';
import { StoreService } from '../index';
import { KeyService, KeyStoreParams, KeyType, PSNS } from '../key';
import { SerializerService } from '../serializer';
import { ILogger } from '../../logger';
import { ActivityDataType } from '../../../typedefs/activity';
import { AppVersion } from '../../../typedefs/app';
import { SubscriptionCallback } from '../../../typedefs/conductor';
import { HookRule, HookSignal } from '../../../typedefs/hook';
import { JobContext, JobData } from '../../../typedefs/job';
import { PubSubDBApp, PubSubDBSettings } from '../../../typedefs/pubsubdb';
import { RedisClientType, RedisMultiType } from '../../../typedefs/redis';
import { IdsData, JobStats, JobStatsRange, StatsType } from '../../../typedefs/stats';
import { Transitions } from '../../../typedefs/transition';

class RedisStoreService extends StoreService {
  redisClient: RedisClientType;
  redisSubscriber: RedisClientType;
  cache: Cache;
  namespace: string;
  subscriptionHandler: SubscriptionCallback;
  logger: ILogger;

  constructor(redisClient: RedisClientType, redisSubscriber?: RedisClientType) {
    super();
    this.redisClient = redisClient;
    this.redisSubscriber = redisSubscriber;
  }

  /**
   * the user calls the constructor to provide the redis instance(s);
   * the engine calls this method to initialize the store
   */
  async init(namespace = PSNS, appId: string, logger: ILogger): Promise<{[appId: string]: PubSubDBApp}> {
    this.namespace = namespace;
    this.logger = logger;
    const settings = await this.getSettings(true);
    this.cache = new Cache(appId, settings);
    await this.getApp(appId);
    return this.cache.getApps();
  }

  getMulti(): RedisMultiType {
    const multi = this.redisClient.MULTI();
    return multi as unknown as RedisMultiType;
  }

  mintKey(type: KeyType, params: KeyStoreParams): string {
    if (!this.namespace) throw new Error('namespace not set');
    return KeyService.mintKey(this.namespace, type, params);
  }

  invalidateCache() {
    this.cache.invalidate();
  }

  async getSettings(bCreate = false): Promise<PubSubDBSettings> {
    let settings = this.cache?.getSettings();
    if (settings) {
      return settings;
    } else {
      if (bCreate) {
        const packageJson = await import('../../../package.json');
        const version: string = packageJson.version;
        settings = { namespace: PSNS, version } as PubSubDBSettings;
        await this.setSettings(settings);
        return settings;
      }
    }
    throw new Error('settings not found');
  }

  async setSettings(manifest: PubSubDBSettings): Promise<any> {
    //PubSubDB heartbeat. If a connection is made, the version will be set
    const params: KeyStoreParams = {};
    const key = this.mintKey(KeyType.PUBSUBDB, params);
    return await this.redisClient.HSET(key, manifest);
  }

  async getApp(id: string, refresh = false): Promise<PubSubDBApp> {
    let app: Partial<PubSubDBApp> = this.cache.getApp(id);
    if (refresh || !(app && Object.keys(app).length > 0)) {
      const params: KeyStoreParams = { appId: id };
      const key = this.mintKey(KeyType.APP, params);
      const sApp = await this.redisClient.HGETALL(key);
      if (!sApp) return null;
      app = {};
      for (const field in sApp) {
        try {
          app[field] = JSON.parse(sApp[field] as string);
        } catch (e) {
          app[field] = sApp[field];
        }
      }
      this.cache.setApp(id, app as PubSubDBApp);
    }
    return app as PubSubDBApp;
  }

  async setApp(id: string, version: string): Promise<PubSubDBApp> {
    const params: KeyStoreParams = { appId: id };
    const key = this.mintKey(KeyType.APP, params);
    const versionId = `versions/${version}`;
    const payload: PubSubDBApp = {
      id,
      version,
      [versionId]: `deployed:${new Date().toISOString()}`,
    };
    await this.redisClient.HSET(key, payload as any);
    this.cache.setApp(id, payload);
    return payload;
  }

  async activateAppVersion(id: string, version: string): Promise<any> {
    const params: KeyStoreParams = { appId: id };
    const key = this.mintKey(KeyType.APP, params);
    const versionId = `versions/${version}`;
    const app = await this.getApp(id);
    if (app && app[versionId]) {
      const payload: PubSubDBApp = {
        id,
        version,
        [versionId]: `activated:${new Date().toISOString()}`,
        active: true
      };
      Object.entries(payload).forEach(([key, value]) => {
        payload[key] = JSON.stringify(value);
      });
      return await this.redisClient.HSET(key, payload as any);
    }
    throw new Error(`Version ${version} does not exist for app ${id}`);
  }

  async registerAppVersion(appId: string, version: string): Promise<any> {
    const params: KeyStoreParams = { appId };
    const key = this.mintKey(KeyType.APP, params);
    const payload: PubSubDBApp = {
      id: appId,
      version,
      [`versions/${version}`]: new Date().toISOString()
    };
    return await this.redisClient.HSET(key, payload as any);
  }

  async setJobStats(jobKey: string, jobId: string, dateTime: string, stats: StatsType, appVersion: AppVersion, multi? : any): Promise<any|string> {
    const params: KeyStoreParams = { appId: appVersion.id, jobId, jobKey, dateTime };
    const privateMulti = multi || await this.redisClient.MULTI();
    if (stats.general.length) {
      const generalStatsKey = this.mintKey(KeyType.JOB_STATS_GENERAL, params);
      for (const { target, value } of stats.general) {
        privateMulti.HINCRBYFLOAT(generalStatsKey, target, value as number);
      }
    }
    for (const { target, value } of stats.index) {
      const indexParams = { ...params, facet: target };
      const indexStatsKey = this.mintKey(KeyType.JOB_STATS_INDEX, indexParams);
      privateMulti.RPUSH(indexStatsKey, value.toString());
    }
    for (const { target, value } of stats.median) {
      const medianParams = { ...params, facet: target };
      const medianStatsKey = this.mintKey(KeyType.JOB_STATS_MEDIAN, medianParams);
      privateMulti.ZADD(medianStatsKey, { score: value.toString(), value: value.toString() } as any);
    }
    if (!multi) {
      return await privateMulti.exec();
    }
  }

  async getJobStats(jobKeys: string[], config: AppVersion): Promise<JobStatsRange> {
    const multi = this.getMulti();
    for (const jobKey of jobKeys) {
      const jobStatsKey = this.mintKey(KeyType.JOB_STATS_GENERAL, { appId: config.id, jobKey });
      multi.HGETALL(jobStatsKey);
    }
    const results = await multi.exec();
    const output: { [key: string]: JobStats } = {};
    for (const [index, result] of results.entries()) {
      const key = jobKeys[index];
      const statsHash: unknown = result[1];
      if (statsHash && Object.keys(statsHash).length > 0) {
        for (const [key, val] of Object.entries(statsHash as object)) {
          statsHash[key] = Number(val);
        }
        output[key] = statsHash as JobStats;
      } else {
        output[key] = {} as JobStats;
      }
    }
    return output;
  }

  async getJobIds(indexKeys: string[], idRange: [number, number]): Promise<IdsData> {
    const multi = this.getMulti();
    for (const idsKey of indexKeys) {
      multi.LRANGE(idsKey, idRange[0], idRange[1]); //0,-1 returns all ids
    }
    const results = await multi.exec();
    const output: IdsData = {};
    for (const [index, result] of results.entries()) {
      const key = indexKeys[index];
      const idsList: string[] = result[1];
      if (idsList && idsList.length > 0) {
        output[key] = idsList;
      } else {
        output[key] = [];
      }
    }
    return output;
  }

  async updateJobStatus(jobId: string, collationKeyStatus: number, appVersion: AppVersion, multi? : any): Promise<any> {
    const jobKey = this.mintKey(KeyType.JOB_DATA, { appId: appVersion.id, jobId });
    return await (multi || this.redisClient).HINCRBYFLOAT(jobKey, 'm/js', collationKeyStatus);
  }

  async setJob(jobId: string, data: Record<string, unknown>, metadata: Record<string, unknown>, appVersion: AppVersion, multi? : any): Promise<any|string> {
    const hashKey = this.mintKey(KeyType.JOB_DATA, { appId: appVersion.id, jobId });
    const jobData = { }
    if (data && Object.keys(data).length > 0) {
      jobData['d'] = data;
    }
    if (metadata && Object.keys(metadata).length > 0) {
      jobData['m'] = metadata;
    }
    if (Object.keys(jobData).length !== 0) {
      const hashData = SerializerService.flattenHierarchy({ m: metadata, d: data});
      if (Object.keys(hashData).length !== 0) {
        await (multi || this.redisClient).HSET(hashKey, hashData);
        return multi || jobId;
      }
    }
  }

  async getJobMetadata(jobId: string, appVersion: AppVersion): Promise<any> {
    const metadataFields = ['m/pj', 'm/pa', 'm/aid', 'm/atp', 'm/stp', 'm/jc', 'm/ju', 'm/jid', 'm/key', 'm/ts', 'm/js'];
    const params: KeyStoreParams = { appId: appVersion.id, jobId };
    const key = this.mintKey(KeyType.JOB_DATA, params);
    const arrMetadata = await this.redisClient.HMGET(key, metadataFields);
    const objMetadata = metadataFields.reduce((acc, field, index) => {
      if (arrMetadata[index] === null) return acc; //skip null values (which are optional fields
      acc[field] = arrMetadata[index];
      return acc;
    }, {});
    const metadata = SerializerService.restoreHierarchy(objMetadata);
    return metadata.m;
  }

  async getJobContext(jobId: string, appVersion: AppVersion): Promise<JobContext | undefined> {
    const params: KeyStoreParams = { appId: appVersion.id, jobId };
    const key = this.mintKey(KeyType.JOB_DATA, params);
    const jobData = await this.redisClient.HGETALL(key);
    const data = SerializerService.restoreHierarchy(jobData);
    return data?.m ? { data: data.d, metadata: data.m} : undefined;
  }

  async getJobData(jobId: string, appVersion: AppVersion): Promise<JobData | undefined> {
    const context = await this.getJobContext(jobId, appVersion);
    return context?.data || undefined;
  }

  async getJob(jobId: string, appVersion: AppVersion): Promise<JobData | undefined> {
    return await this.getJobData(jobId, appVersion);
  }

  async restoreContext(
    jobId: string,
    dependsOn: Record<string, string[]>,
    config: AppVersion
  ): Promise<Partial<JobContext>> {
    const multi = this.getMulti();
    const keysAndFields: { activityId: string; key: string; fields: string[] }[] = [];

    // 1) get the job metadata
    const jobKey = this.mintKey(KeyType.JOB_DATA, { appId: config.id, jobId });
    const jobMetdataIds = ['m/pj', 'm/pa', 'm/jid', 'm/key', 'm/ts', 'm/js', 'm/jc', 'm/ju'];
    multi.HMGET(jobKey, jobMetdataIds);
    keysAndFields.push({ activityId: '$JOB', key: jobKey, fields: jobMetdataIds });

    // 2) iterate dependency list to target-and-pluck data, metadata, and/or hookdata
    for (const [activityId, dependsOnIds] of Object.entries(dependsOn)) {
      const params: KeyStoreParams = { appId: config.id, jobId, activityId };
      const key = this.mintKey(KeyType.JOB_ACTIVITY_DATA, params);
      multi.HMGET(key, dependsOnIds);
      keysAndFields.push({ activityId, key, fields: dependsOnIds });
    }
    const results = await multi.exec();

    //3) return the restored Context
    const restoredData: Partial<JobContext> = {};
    for (let i = 0; i < keysAndFields.length; i++) {
      const { activityId, fields } = keysAndFields[i];
      const data = results[i];
      const upstreamData = SerializerService.restoreHierarchy(fields.reduce(
        (accumulator: Record<string, any>, field, index) => {
          if (data[index] !== null) accumulator[field] = data[index];
          return accumulator;
        },
        {}
      ));
      if (activityId === '$JOB') {
        restoredData.metadata = upstreamData?.m;
      } else {
        restoredData[activityId] = {
          input: {
            data: upstreamData?.i,
            metadata: upstreamData?.m,
          },
          output: {
            data: upstreamData?.d,
            metadata: upstreamData?.m,
          },
          hook: {
            data: upstreamData?.h,
            metadata: upstreamData?.m,
          },
        };
      }
    }
    return restoredData;
  }

  async setActivity(jobId: string, activityId: string, data: Record<string, unknown>, metadata: Record<string, unknown>, hook: Record<string, unknown> | null, appVersion: AppVersion, multi? : RedisClientType): Promise<RedisClientType|string>  {
    const hashKey = this.mintKey(KeyType.JOB_ACTIVITY_DATA, { appId: appVersion.id, jobId, activityId });
    const hashData = SerializerService.flattenHierarchy({ m: metadata, d: data, h: hook && Object.keys(hook).length ? hook : undefined });
    await (multi || this.redisClient).HSET(hashKey, hashData as any);
    return multi || activityId;
  }

  async setActivityNX(jobId: string, activityId: any, config: AppVersion): Promise<number> {
    const hashKey = this.mintKey(KeyType.JOB_ACTIVITY_DATA, { appId: config.id, jobId, activityId });
    const response = await this.redisClient.HSETNX(hashKey, 'm/aid', activityId);
    return response ? 1 : 0;
  }

  async getActivityMetadata(jobId: string, activityId: string, appVersion: AppVersion): Promise<any> {
    const metadataFields = ['m/aid', 'm/atp', 'm/stp', 'm/ac', 'm/au', 'm/jid', 'm/key'];
    const params: KeyStoreParams = { appId: appVersion.id, jobId, activityId };
    const key = this.mintKey(KeyType.JOB_ACTIVITY_DATA, params);
    const arrMetadata = await this.redisClient.HMGET(key, metadataFields);
    const objMetadata = metadataFields.reduce((acc, field, index) => {
      if (arrMetadata[index] === null) return acc; //skip null values (which are optional fields
      acc[field] = arrMetadata[index];
      return acc;
    }, {});
    const metadata = SerializerService.restoreHierarchy(objMetadata);
    return metadata.m;
  }

  async getActivityContext(jobId: string, activityId: string, appVersion: AppVersion): Promise<ActivityDataType | null | undefined> {
    const params: KeyStoreParams = { appId: appVersion.id, jobId, activityId };
    const key = this.mintKey(KeyType.JOB_ACTIVITY_DATA, params);
    const activityData = await this.redisClient.HGETALL(key);
    if (activityData) {
      const data = SerializerService.restoreHierarchy(activityData);
      if (data) {
        const response: ActivityDataType = { metadata: data.m };
        if (data.d) response.data = data.d;
        if (data.h) response.hook = data.h;
        return response;
      } else {
        return null;
      }
    }
  }

  async getActivity(jobId: string, activityId: string, appVersion: AppVersion): Promise<Record<string, unknown> | null | undefined> {
    const context = await this.getActivityContext(jobId, activityId, appVersion);
    return context?.data ? context.data : context?.metadata ? null : undefined;
  }

  async getSchema(activityId: string, appVersion: AppVersion): Promise<any> {
    const schema = this.cache.getSchema(appVersion.id, appVersion.version, activityId);
    if (schema) {
      return schema
    } else {
      const schemas = await this.getSchemas(appVersion);
      return schemas[activityId];
    }
  }

  async getSchemas(appVersion: AppVersion): Promise<any> {
    let schemas = this.cache.getSchemas(appVersion.id, appVersion.version);
    if (schemas && Object.keys(schemas).length > 0) {
      return schemas;
    } else {
      const params: KeyStoreParams = { appId: appVersion.id, appVersion: appVersion.version };
      const key = this.mintKey(KeyType.SCHEMAS, params);
      schemas = await this.redisClient.HGETALL(key);
      Object.entries(schemas).forEach(([key, value]) => {
        schemas[key] = JSON.parse(value as string);
      });
      this.cache.setSchemas(appVersion.id, appVersion.version, schemas);
      return schemas;
    }
  }

  async setSchemas(schemas: Record<string, any>, appVersion: AppVersion): Promise<any> {
    const params: KeyStoreParams = { appId: appVersion.id, appVersion: appVersion.version };
    const key = this.mintKey(KeyType.SCHEMAS, params);
    const _schemas = {...schemas};
    Object.entries(_schemas).forEach(([key, value]) => {
      _schemas[key] = JSON.stringify(value);
    });
    const response = await this.redisClient.HSET(key, _schemas);
    this.cache.setSchemas(appVersion.id, appVersion.version, schemas);
    return response;
  }

  async setSubscriptions(subscriptions: Record<string, any>, appVersion: AppVersion): Promise<void> {
    const params: KeyStoreParams = { appId: appVersion.id, appVersion: appVersion.version };
    const key = this.mintKey(KeyType.SUBSCRIPTIONS, params);
    const _subscriptions = {...subscriptions};
    Object.entries(_subscriptions).forEach(([key, value]) => {
      _subscriptions[key] = JSON.stringify(value);
    });
    await this.redisClient.HSET(key, _subscriptions);
    this.cache.setSubscriptions(appVersion.id, appVersion.version, subscriptions);
  }

  async getSubscriptions(appVersion: AppVersion): Promise<Record<string, string>> {
    let subscriptions = this.cache.getSubscriptions(appVersion.id, appVersion.version);
    if (subscriptions && Object.keys(subscriptions).length > 0) {
      return subscriptions;
    } else {
      const params: KeyStoreParams = { appId: appVersion.id, appVersion: appVersion.version };
      const key = this.mintKey(KeyType.SUBSCRIPTIONS, params);
      subscriptions = await this.redisClient.HGETALL(key) || {};
      Object.entries(subscriptions).forEach(([key, value]) => {
        subscriptions[key] = JSON.parse(value as string);
      });
      this.cache.setSubscriptions(appVersion.id, appVersion.version, subscriptions);
      return subscriptions;
    }
  }

  async getSubscription(topic: string, appVersion: AppVersion): Promise<string | undefined> {
    const subscriptions = await this.getSubscriptions(appVersion);
    return subscriptions[topic];
  }

  async setTransitions(transitions: Record<string, any>, appVersion: AppVersion): Promise<any> {
    const params: KeyStoreParams = { appId: appVersion.id, appVersion: appVersion.version };
    const key = this.mintKey(KeyType.SUBSCRIPTION_PATTERNS, params);
    const _subscriptions = {...transitions};
    Object.entries(_subscriptions).forEach(([key, value]) => {
      _subscriptions[key] = JSON.stringify(value);
    });
    const response = await this.redisClient.HSET(key, _subscriptions);
    this.cache.setTransitions(appVersion.id, appVersion.version, transitions);
    return response;
  }

  async getTransitions(appVersion: AppVersion): Promise<Transitions> {
    let transitions = this.cache.getTransitions(appVersion.id, appVersion.version);
    if (transitions && Object.keys(transitions).length > 0) {
      return transitions;
    } else {
      const params: KeyStoreParams = { appId: appVersion.id, appVersion: appVersion.version };
      const key = this.mintKey(KeyType.SUBSCRIPTION_PATTERNS, params);
      transitions = {};
      const hash = await this.redisClient.HGETALL(key);
      Object.entries(hash).forEach(([key, value]) => {
        transitions[key] = JSON.parse(value as string);
      });
      this.cache.setTransitions(appVersion.id, appVersion.version, transitions);
      return transitions;
    }
  }

  async setHookRules(hookRules: Record<string, HookRule[]>, appVersion: AppVersion): Promise<any> {
    const key = this.mintKey(KeyType.HOOKS, { appId: appVersion.id });
    const _hooks = { };
    Object.entries(hookRules).forEach(([key, value]) => {
      _hooks[key.toString()] = JSON.stringify(value);
    });
    const response = await this.redisClient.HSET(key, _hooks);
    this.cache.setHookRules(appVersion.id, hookRules);
    return response;
  }

  async getHookRules(appVersion: AppVersion): Promise<Record<string, HookRule[]>> {
    let patterns = this.cache.getHookRules(appVersion.id);
    if (patterns && Object.keys(patterns).length > 0) {
      return patterns;
    } else {
      const key = this.mintKey(KeyType.HOOKS, { appId: appVersion.id });
      const _hooks = await this.redisClient.HGETALL(key);
      patterns = {};
      Object.entries(_hooks).forEach(([key, value]) => {
        patterns[key] = JSON.parse(value as string);
      });
      this.cache.setHookRules(appVersion.id, patterns);
      return patterns;
    }
  }

  async setHookSignal(hook: HookSignal, appVersion: AppVersion, multi?: any): Promise<any> {
    const key = this.mintKey(KeyType.SIGNALS, { appId: appVersion.id });
    const { topic, resolved, jobId} = hook;
    return await (multi || this.redisClient).HSET(key, `${topic}:${resolved}`, jobId);
  }

  async getHookSignal(topic: string, resolved: string, appVersion: AppVersion): Promise<string | undefined> {
    const key = this.mintKey(KeyType.SIGNALS, { appId: appVersion.id });
    const multi = this.getMulti();
    multi.HGET(key, `${topic}:${resolved}`);
    multi.HDEL(key, `${topic}:${resolved}`);
    const response = await multi.exec();
    return response[0];
  }

  async subscribe(keyType: KeyType.CONDUCTOR, subscriptionHandler: SubscriptionCallback, appVersion: AppVersion): Promise<void> {
    if (this.redisSubscriber) {
      const self = this;
      const topic = this.mintKey(keyType, { appId: appVersion.id });
      await this.redisSubscriber.subscribe(topic, (message) => {
        try {
          const payload = JSON.parse(message);
          subscriptionHandler(topic, payload);
        } catch (e) {
          self.logger.error(`Error parsing message: ${message}`, e);
        }
      });
    }
  }

  async unsubscribe(topic: string, _: AppVersion): Promise<void> {
    await this.redisSubscriber?.unsubscribe(topic);
  }

  async publish(keyType: KeyType.CONDUCTOR, message: Record<string, any>, appVersion: AppVersion): Promise<void> {
    const topic = this.mintKey(keyType, { appId: appVersion.id });
    this.redisClient.publish(topic, JSON.stringify(message));
  }

  async addTaskQueues(keys: string[], appVersion: AppVersion): Promise<void> {
    const multi = this.redisClient.multi();
    const zsetKey = this.mintKey(KeyType.WORK_ITEMS, { appId: appVersion.id });
    for (const key of keys) {
      multi.ZADD(zsetKey, { score: Date.now().toString(), value: key } as any, { NX: true });
    }
    await multi.exec();
  }

  async getActiveTaskQueue(appVersion: AppVersion): Promise<string | null> {
    const { id: appId } = appVersion;
    let workItemKey = this.cache.getActiveTaskQueue(appId) || null;
    if (!workItemKey) {
      const zsetKey = this.mintKey(KeyType.WORK_ITEMS, { appId });
      const result = await this.redisClient.ZRANGE(zsetKey, 0, 0);
      workItemKey = result.length > 0 ? result[0] : null;
      if (workItemKey) {
        this.cache.setWorkItem(appId, workItemKey);
      }
    }
    return workItemKey;
  }

  async deleteProcessedTaskQueue(workItemKey: string, key: string, processedKey: string, appVersion: AppVersion): Promise<void> {
    const zsetKey = this.mintKey(KeyType.WORK_ITEMS, { appId: appVersion.id });
    const didRemove = await this.redisClient.ZREM(zsetKey, workItemKey);
    if (didRemove) {
      await this.redisClient.RENAME(processedKey, key);
    }
    this.cache.removeWorkItem(appVersion.id);
  }

  async processTaskQueue(sourceKey: string, destinationKey: string): Promise<any> {
    return await this.redisClient.LMOVE(sourceKey, destinationKey, 'LEFT', 'RIGHT');
  }
}

export { RedisStoreService };
