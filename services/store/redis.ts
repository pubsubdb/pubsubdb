import { PubSubDBApp, PubSubDBApps, PubSubDBSettings } from '../../typedefs/pubsubdb';
import { KeyStore, KeyStoreParams, KeyType, PSNS } from './keyStore';
import { Cache } from './cache';
import { StoreService } from './store';
import { StatsType } from '../../typedefs/stats';
import { SerializerService } from './serializer';
import { AppVersion } from '../../typedefs/app';

class RedisStoreService extends StoreService {
  redisClient: any;
  cache: Cache;
  namespace: string;

  constructor(redisClient: any) {
    super();
    this.redisClient = redisClient;
  }

  /**
   * only the engine can call this method; it initializes the local cache. the developer
   * must have the opportunity to set the cache namespace by init'ing the PSDB instance.
   * That instance will call this mathod, providing the necessary namespace override
   * and ensuring no collisions.
   * @param namespace
   * @param appId
   * @returns {Promise<{[appId: string]: PubSubDBApp}>}
   */
  async init(namespace = PSNS, appId: string): Promise<{[appId: string]: PubSubDBApp}> {
    this.namespace = namespace;
    const settings = await this.getSettings(true);
    this.cache = new Cache(appId, settings);
    return await this.getApps();
  }

  /**
   * mint a key to access a given entity (KeyType) in the store
   * @param type 
   * @param params 
   * @returns 
   */
  mintKey(type: KeyType, params: KeyStoreParams): string {
    if (!this.namespace) throw new Error('namespace not set');
    return KeyStore.mintKey(this.namespace, type, params);
  }

  /**
   * invalidates the local cache; would be called if a new version were to be deployed
   */
  invalidateCache() {
    this.cache.invalidate();
  }

  /**
   * get the pubsubdb global settings ({hash}) from the store; 
   * the settings reveal information about the namespace, the version of the pubsubdb
   * 
   * @param {boolean} bCreate - if true, create the settings if they don't exist
   * @returns {Promise<PubSubDBSettings>}
   */
  async getSettings(bCreate = false): Promise<PubSubDBSettings> {
    let settings = this.cache?.getSettings();
    if (settings) {
      return settings;
    } else {
      if (bCreate) {
        const packageJson = await import('../../package.json');
        const version: string = packageJson.version;
        settings = { namespace: PSNS, version } as PubSubDBSettings;
        await this.setSettings(settings);
        return settings;
      }
    }
    throw new Error('settings not found');
  }

  /**
   * sets the pubsubdb global settings ({hash}) in the store;
   * 
   * @param {any} manifest
   * @returns {Promise<any>}
   */
  async setSettings(manifest: PubSubDBSettings): Promise<any> {
    const params: KeyStoreParams = {};
    const key = this.mintKey(KeyType.PUBSUBDB, params);
    return await this.redisClient.hSet(key, manifest);
  }

  async getApps(): Promise<{[appId: string]: PubSubDBApp}> {
    let apps: PubSubDBApps = this.cache.getApps();
    if (apps && Object.keys(apps).length > 0) {
      return apps;
    } else {
      const key = this.mintKey(KeyType.APP, {});
      const appKeys: string[] = [];
      let cursor = '0', tuples = [];
      // Collect app keys using hScan
      do {
        const val = await this.redisClient.hScan(key, cursor) as { cursor: string, tuples: string[] };
        cursor = val.cursor;
        tuples = val.tuples;
        for (let i = 0; i < tuples.length; i += 2) {
          const appId = tuples[i];
          appKeys.push(appId);
        }
      } while (Number(cursor) !== 0);
      // Create multi to fetch app data
      const multi = this.redisClient.multi();
      for (const appKey of appKeys) {
        multi.hGetAll(appKey);
      }
      // Execute multi and process results
      const multiResults = await multi.exec();
      apps = {};
      for (const [index, [err, appData]] of multiResults.entries()) {
        if (err) {
          throw err;
        }
        const appId = appKeys[index];
        apps[appId] = JSON.parse(appData) as PubSubDBApp;
      }
      this.cache.setApps(apps);
    }
    return apps;
  }  

  /**
   * gets a specific app manifest revealing all versions and settings and status for
   * the app.
   * 
   * @returns {Promise<any>}
   */
  async getApp(id: string): Promise<PubSubDBApp> {
    let app = this.cache.getApp(id);
    if (app && Object.keys(app).length > 0) {
      return app;
    } else {
      const params: KeyStoreParams = { appId: id };
      const key = this.mintKey(KeyType.APP, params);
      app = await this.redisClient.hGetAll(key);
      this.cache.setApp(id, app);
    }
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
    await this.redisClient.hSet(key, payload);
    this.cache.setApp(id, payload);
    return payload;
  }

  /**
   * sets/locks the active version for an app; this is used to track the versions of the app that are
   * currently "active". this is set at deploy time after the segmenter has persisted all models to the store.
   * 
   * @param {string} id
   * @param {string} version
   * @returns {Promise<any>}
   */
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
      return await this.redisClient.hSet(key, payload);
    }
    throw new Error(`Version ${version} does not exist for app ${id}`);
  }

  /**
   * registers an app version; this is used to track known versions of the app in any state.
   * The version is set at compile time for an app BEFORE the segmenter
   * starts persisting definitions to the store. The corresponding lifecycle method,
   * `activateAppVersion`, can be called to lock the active version once the segmenter has
   * verified that all models have been persisted to the store.
   * 
   * @param {any} manifest
   * @returns {Promise<any>}
   */
  async registerAppVersion(appId: string, version: string): Promise<any> {
    const params: KeyStoreParams = { appId };
    const key = this.mintKey(KeyType.APP, params);
    const payload: PubSubDBApp = {
      id: appId,
      version,
      [`versions/${version}`]: new Date().toISOString()
    };
    return await this.redisClient.hSet(key, payload);
  }

  /**
   * every job that includes a 'stats' field will have its stats aggregated into various
   * data structures that can be used to query the store for job stats. The `general`
   * stats are persisted to a HASH; `index` uses LIST; and `median` uses ZSET.
   * 
   * @param jobKey
   * @param jobId
   * @param dateTime 
   * @param stats 
   * @param appVersion
   * @returns 
   */
  async setJobStats(jobKey: string, jobId: string, dateTime: string, stats: StatsType, appVersion: AppVersion): Promise<string> {
    const params: KeyStoreParams = { appId: appVersion.id, jobId, jobKey, dateTime };
    const multi = await this.redisClient.multi();
    //general
    if (stats.general.length) {
      const generalStatsKey = this.mintKey(KeyType.JOB_STATS_GENERAL, params);
      for (const { target, value } of stats.general) {
        multi.HINCRBYFLOAT(generalStatsKey, target, value);
      }
    }
    //index
    for (const { target, value } of stats.index) {
      const indexParams = { ...params, facet: target };
      const indexStatsKey = this.mintKey(KeyType.JOB_STATS_INDEX, indexParams);
      multi.RPUSH(indexStatsKey, value.toString());
    }
    //median
    for (const { target, value } of stats.median) {
      const medianParams = { ...params, facet: target };
      const medianStatsKey = this.mintKey(KeyType.JOB_STATS_MEDIAN, medianParams);
      multi.ZADD(medianStatsKey, { score: value.toString(), value: value.toString() });
    }
    return await multi.exec();
  }

  /**
   * adds a job (data), metadata, and aggregation stats to the store; the jobId is provided
   * by the engine and can be used to retrieve the job later. The ID is either created by the engine
   * or is provided by the user as part of the job data. The schema for the activity data contains
   * the definition, necessary to resolve which jobId to use.
   * 
   * @param jobId
   * @param data 
   * @param metadata 
   * @returns 
   */
  async setJob(jobId: string, data: Record<string, unknown>, metadata: Record<string, unknown>, appVersion: AppVersion): Promise<string> {
    const hashKey = this.mintKey(KeyType.JOB_DATA, { appId: appVersion.id, jobId });
    const hashData = SerializerService.flattenHierarchy({ m: metadata, d: data});
    const response = await this.redisClient.HSET(hashKey, hashData);
    return jobId;
  }

  async getJobMetadata(jobId: string, appVersion: AppVersion): Promise<any> {
    const metadataFields = ['m/activity_id', 'm/activity_type', 'm/activity_subtype', 'm/job_created', 'm/job_updated', 'm/job_id', 'm/job_key', 'm/time_series', 'm/job_status'];
    const params: KeyStoreParams = { appId: appVersion.id, jobId };
    const key = this.mintKey(KeyType.JOB_DATA, params);
    const arrMetadata = await this.redisClient.HMGET(key, metadataFields);
    //iterate to create an object where the keys are the metadata fields and values are jobMetadata
    const objMetadata = metadataFields.reduce((acc, field, index) => {
      if (arrMetadata[index] === null) return acc; //skip null values (which are optional fields
      acc[field] = arrMetadata[index];
      return acc;
    }, {});
    const metadata = SerializerService.restoreHierarchy(objMetadata);
    return metadata.m;
  }

  /**
   * gets the job data;
   * 1) returns `undefined` if the job does not exist at all
   * 2) returns `null` if the job exists, but no data was stored 
   *    (which can happen if no `job` map rules existed on the trigger)
   * 
   * @param jobId 
   * @param appVersion 
   * @returns 
   */
  async getJobData(jobId: string, appVersion: AppVersion): Promise<any> {
    const params: KeyStoreParams = { appId: appVersion.id, jobId };
    const key = this.mintKey(KeyType.JOB_DATA, params);
    const jobData = await this.redisClient.HGETALL(key);
    const data = SerializerService.restoreHierarchy(jobData);
    return data.d ? data. d : (data.m ? null : undefined);
  }

  /**
   * convenience method to get the job data
   * @param jobId 
   * @returns 
   */
  async getJob(jobId: string, appVersion: AppVersion): Promise<any> {
    return await this.getJobData(jobId, appVersion);
  }

  /**
   * convenience method to get the job data
   * @param jobId 
   * @returns 
   */
  async get(jobId: string, appVersion: AppVersion): Promise<any> {
    return await this.getJobData(jobId, appVersion);
  }

  /**
   * adds an activity (data), metadata, and aggregation stats to the store; the jobId is provided
   * @param jobId 
   * @param activityId 
   * @param data 
   * @param metadata 
   * @param appVersion 
   * @returns 
   */
  async setActivity(jobId: string, activityId: string, data: Record<string, unknown>, metadata: Record<string, unknown>, appVersion: AppVersion): Promise<string>  {
    const hashKey = this.mintKey(KeyType.JOB_ACTIVITY_DATA, { appId: appVersion.id, jobId, activityId });
    const hashData = SerializerService.flattenHierarchy({ m: metadata, d: data});
    const response = await this.redisClient.HSET(hashKey, hashData);
    return activityId;
  }
  
  /**
   * gets the activity metadata; returns undefined if the activity does not exist; can happen
   * if the activity was garbage collected
   * @param jobId 
   * @param activityId 
   * @param appVersion 
   * @returns {undefined|Record<string, any>}
   */
  async getActivityMetadata(jobId: string, activityId: string, appVersion: AppVersion): Promise<any> {
    const metadataFields = ['m/activity_id', 'm/activity_type', 'm/activity_subtype', 'm/activity_created', 'm/activity_updated', 'm/job_id', 'm/job_key'];
    const params: KeyStoreParams = { appId: appVersion.id, jobId, activityId };
    const key = this.mintKey(KeyType.JOB_ACTIVITY_DATA, params);
    const arrMetadata = await this.redisClient.HMGET(key, metadataFields);
    //iterate to create an object where the keys are the metadata fields and values are jobMetadata
    const objMetadata = metadataFields.reduce((acc, field, index) => {
      if (arrMetadata[index] === null) return acc; //skip null values (which are optional fields
      acc[field] = arrMetadata[index];
      return acc;
    }, {});
    const metadata = SerializerService.restoreHierarchy(objMetadata);
    return metadata.m;
  }

  /**
   * gets the activity data;
   * 1) returns `undefined` if the activity does not exist at all
   * 2) returns `null` if the activity exists, but no data was stored 
   *    (which can happen if no downstream activities are mapped to its output)
   * 
   * @param jobId 
   * @param activityId 
   * @param appVersion 
   * @returns {undefined|null|Record<string, any>}
   */
  async getActivityData(jobId: string, activityId: string, appVersion: AppVersion): Promise<any> {
    const params: KeyStoreParams = { appId: appVersion.id, jobId, activityId };
    const key = this.mintKey(KeyType.JOB_ACTIVITY_DATA, params);
    const activityData = await this.redisClient.HGETALL(key);
    const data = SerializerService.restoreHierarchy(activityData);
    return data.d ? data. d : (data.m ? null : undefined);
  }

  /**
   * convenience method to get the activity data
   * @param jobId 
   * @param activityId 
   * @param appVersion 
   * @returns 
   */
  async getActivity(jobId: string, activityId: string, appVersion: AppVersion): Promise<any> {
    return await this.getActivityData(jobId, activityId, appVersion);
  }

  /**
   * Checks the cache for the schema and if not found, fetches it from the store
   * 
   * @param topic 
   * @returns 
   */
  async getSchema(activityId: string, appVersion: AppVersion): Promise<any> {
    let schema = this.cache.getSchema(appVersion.id, appVersion.version, activityId);
    if (schema) {
      return schema
    } else {
      const schemas = await this.getSchemas(appVersion);
      return schemas[activityId];
    }
  }

  /**
   * Always fetches the schemas from the store and caches them in memory
   * @returns 
   */
  async getSchemas(appVersion: AppVersion): Promise<any> {
    let schemas = this.cache.getSchemas(appVersion.id, appVersion.version);
    if (schemas && Object.keys(schemas).length > 0) {
      return schemas;
    } else {
      const params: KeyStoreParams = { appId: appVersion.id, appVersion: appVersion.version };
      const key = this.mintKey(KeyType.SCHEMAS, params);
      schemas = await this.redisClient.hGetAll(key);
      Object.entries(schemas).forEach(([key, value]) => {
        schemas[key] = JSON.parse(value as string);
      });
      this.cache.setSchemas(appVersion.id, appVersion.version, schemas);
      return schemas;
    }
  }

  /**
   * Sets the schemas for all topics in the store and in memory
   * @param schemas 
   * @returns 
   */
  async setSchemas(schemas: Record<string, any>, appVersion: AppVersion): Promise<any> {
    const params: KeyStoreParams = { appId: appVersion.id, appVersion: appVersion.version };
    const key = this.mintKey(KeyType.SCHEMAS, params);
    const _schemas = {...schemas};
    Object.entries(_schemas).forEach(([key, value]) => {
      _schemas[key] = JSON.stringify(value);
    });
    const response = await this.redisClient.hSet(key, _schemas);
    this.cache.setSchemas(appVersion.id, appVersion.version, schemas);
    return response;
  }

  /**
   * Registers handlers for public subscriptions for the given topic in the store
   * @param subscriptions 
   * @param appVersion 
   * @returns 
   */
  async setSubscriptions(subscriptions: Record<string, any>, appVersion: AppVersion): Promise<void> {
    const params: KeyStoreParams = { appId: appVersion.id, appVersion: appVersion.version };
    const key = this.mintKey(KeyType.SUBSCRIPTIONS, params);
    const _subscriptions = {...subscriptions};
    Object.entries(_subscriptions).forEach(([key, value]) => {
      _subscriptions[key] = JSON.stringify(value);
    });
    const response = await this.redisClient.hSet(key, _subscriptions);
    this.cache.setSubscriptions(appVersion.id, appVersion.version, subscriptions);
    return response;
  }

  async getSubscriptions(appVersion: { id: string; version: string }): Promise<Record<string, string>> {
    let subscriptions = this.cache.getSubscriptions(appVersion.id, appVersion.version);
    if (subscriptions && Object.keys(subscriptions).length > 0) {
      return subscriptions;
    } else {
      const params: KeyStoreParams = { appId: appVersion.id, appVersion: appVersion.version };
      const key = this.mintKey(KeyType.SUBSCRIPTIONS, params);
      subscriptions = await this.redisClient.hGetAll(key) || {};
      Object.entries(subscriptions).forEach(([key, value]) => {
        subscriptions[key] = JSON.parse(value as string);
      });
      this.cache.setSubscriptions(appVersion.id, appVersion.version, subscriptions);
      return subscriptions;
    }
  }

  async getSubscription(topic: string, appVersion: { id: string; version: string }): Promise<string | undefined> {
    let subscriptions = await this.getSubscriptions(appVersion);
    return subscriptions[topic];
  }

  async setSubscriptionPatterns(subscriptionPatterns: Record<string, any>, appVersion: AppVersion): Promise<any> {
    const params: KeyStoreParams = { appId: appVersion.id, appVersion: appVersion.version };
    const key = this.mintKey(KeyType.SUBSCRIPTION_PATTERNS, params);
    const _subscriptions = {...subscriptionPatterns};
    Object.entries(_subscriptions).forEach(([key, value]) => {
      _subscriptions[key] = JSON.stringify(value);
    });
    const response = await this.redisClient.hSet(key, _subscriptions);
    this.cache.setSubscriptionPatterns(appVersion.id, appVersion.version, subscriptionPatterns);
    return response;
  }

  async getSubscriptionPatterns(appVersion: { id: string; version: string }): Promise<any> {
    let patterns = this.cache.getSubscriptionPatterns(appVersion.id, appVersion.version);
    if (patterns && Object.keys(patterns).length > 0) {
      return patterns;
    } else {
      const params: KeyStoreParams = { appId: appVersion.id, appVersion: appVersion.version };
      const key = this.mintKey(KeyType.SUBSCRIPTION_PATTERNS, params);
      patterns = await this.redisClient.hGetAll(key);
      Object.entries(patterns).forEach(([key, value]) => {
        patterns[key] = JSON.parse(value as string);
      });
      this.cache.setSubscriptionPatterns(appVersion.id, appVersion.version, patterns);
      return patterns;
    }
  }
}

export { RedisStoreService };
