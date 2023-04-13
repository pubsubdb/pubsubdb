// import { RedisStoreService } from './redis';
// class RedisJSONStoreService extends RedisStoreService {
//   constructor(redisClient: any) {
//     super(redisClient);
//     this.redisClient = redisClient;
//     this.init();
//   }
//   async initSchemaCache() {
//     const schemas = {};
//     this.schemaCache = schemas;
//     const params: KeyStoreParams = { appId: config.id, version: config.version };
//     const key = this.KeyStore.createKey(KeyType.SUBSCRIPTIONS, params);
//     await this.redisClient.json.set(key, '.', schemas, { NX: true });
//   }
//   async initSubscriptionCache() {
//     const subscriptions = {};
//     this.subscriptionCache = subscriptions;
//     const key = this.getKey(NS.SUBSCRIPTIONS);
//     await this.redisClient.json.set(key, '.', subscriptions, { NX: true });
//   }
//   async initTransitionCache() {
//     const subscriptions = {};
//     this.transitionCache = subscriptions;
//     const key = this.getKey(NS.SUBSCRIPTION_PATTERNS);
//     await this.redisClient.json.set(key, '.', subscriptions, { NX: true });
//   }
//   /**
//    * returns the key for the given namespace and key for the store
//    * @param namespace 
//    * @param key 
//    * @returns 
//    */
//   getKey(namespace: string, key = ''): string {
//     return `${PSNS}:${namespace}:${key}`;
//   }
//   /**
//    * returns a key scoped to a specific app; this is typically used for app data; even
//    * if an app version updates the data location doesn't change
//    * @param namespace 
//    * @param key 
//    * @param config 
//    * @returns 
//    */
//   getAppKey(namespace: string, key = '', config: {id:string}): string {
//     return `${PSNS}:${config.id}:${namespace}:${key}`;
//   }
//   /**
//    * returns a key scoped to a specific app version; this is typically used for app
//    * configuration tbales like subscriptions, schemas, etc; when a new app is deployed, it
//    * will isolate using the version and the config will be separate from the previous version;
//    * this keeps it fully isolated during the deploy process; in fact you can choose
//    * to compile and deploy later as the final step in the deploy process
//    * is to update the active version in the manifest; there is no "rollback" as versions
//    * simply change and the old version is no longer active.
//    * 
//    * @param namespace 
//    * @param key 
//    * @param config 
//    * @returns 
//    */
//   getVersionKey(namespace: string, key = '', config: {id: string, version: string}): string {
//     return `${PSNS}:${config.id}:${config.version}:${namespace}:${key}`;
//   }
//   async getSettings(): Promise<any> {
//     const key = this.getKey(NS.PUBSUBDB, 'manifest');
//     return await this.redisClient.json.get(key);
//   }
//   async setSettings(manifest: any): Promise<any> {
//     const key = this.getKey(NS.PUBSUBDB, 'manifest');
//     return await this.redisClient.json.set(key, '.', manifest);
//   }
//   async setJob(jobId: string, data: Record<string, unknown>, metadata: Record<string, unknown>, config: {id: string, version: string}): Promise<string> {
//     const [dataResp, metadataResp] = await this.redisClient.multi()
//       .json.set(this.getAppKey(NS.JOB_DATA, jobId, config), '.', data)
//       .json.set(this.getAppKey(NS.JOB_METADATA, jobId, config), '.', metadata)
//       .exec();
//     return jobId;
//   }
//   async getJobMetadata(jobId: string, config: {id: string, version: string}): Promise<any> {
//     const key = this.getAppKey(NS.JOB_METADATA, jobId, config);
//     return await this.redisClient.json.get(key);
//   }
//   async getJobData(jobId: string, config: {id: string, version: string}): Promise<any> {
//     const key = this.getAppKey(NS.JOB_DATA, jobId, config);
//     return await this.redisClient.json.get(key);
//   }
//   async get(jobId: string, config: {id: string, version: string}): Promise<any> {
//     return await this.getJobData(jobId, config);
//   }
//   async getJob(jobId: string, config: {id: string, version: string}): Promise<any> {
//     return await this.getJobData(jobId, config);
//   }
//   async getActivity(activityId: string, config: {id: string, version: string}): Promise<any> {
//     return await this.getActivityData(activityId, config);
//   }
//   async setActivity(activityId: any, data: Record<string, unknown>, metadata: Record<string, unknown>, config: {id: string, version: string}): Promise<any>  {
//     const [dataResp, metadataResp] = await this.redisClient.multi()
//       .json.set(this.getAppKey(NS.ACTIVITY_DATA, activityId, config), '.', data)
//       .json.set(this.getAppKey(NS.ACTIVITY_METADATA, activityId, config), '.', metadata)
//       .exec();
//     return activityId;
//   }
//   async getActivityMetadata(activityId: string, config: {id: string, version: string}): Promise<any> {
//     const key = this.getAppKey(NS.ACTIVITY_METADATA, activityId, config);
//     return await this.redisClient.json.get(key);
//   }
//   async getActivityData(activityId: string, config: {id: string, version: string}): Promise<any> {
//     const key = this.getAppKey(NS.ACTIVITY_DATA, activityId, config);
//     return await this.redisClient.json.get(key);
//   }
//   async getSchema(topic: string, config: {id: string, version: string}): Promise<any> {
//     if (this.schemaCache && this.schemaCache[topic]) {
//       return this.schemaCache[topic];
//     } else {
//       const key = this.getVersionKey(NS.ACTIVITY_SCHEMAS, '', config);
//       const schema = await this.redisClient.json.get(key, `.["${topic}"]`);
//       if (!this.schemaCache) {
//         await this.initSchemaCache();
//       }
//       return this.schemaCache[topic] = schema[topic];
//     }
//   }
//   async getSchemas(config: {id: string, version: string}): Promise<any> {
//     const key = this.getVersionKey(NS.ACTIVITY_SCHEMAS, '', config);
//     const schemas = await this.redisClient.json.get(key);
//     this.schemaCache = schemas;
//     return schemas;
//   }
//   async setSchemas(schemas: Record<string, any>, config: {id: string, version: string}): Promise<any> {
//     const key = this.getVersionKey(NS.ACTIVITY_SCHEMAS, '', config);
//     const response = await this.redisClient.json.set(key, '.', schemas);
//     this.schemaCache = schemas;
//     return response;
//   }
//   async setSubscriptions(subscriptions: Record<string, any>, config: any): Promise<any> {
//     const key = this.getKey(NS.ACTIVITY_SCHEMAS);
//     const response = await this.redisClient.json.set(key, '.', subscriptions);
//     this.subscriptionCache = subscriptions;
//     return response;
//   }
//   async setTransitions(subscriptionsPatterns: Record<string, any>, config: any): Promise<any> {
//     const key = this.getKey(NS.ACTIVITY_SCHEMAS);
//     const response = await this.redisClient.json.set(key, '.', subscriptionsPatterns);
//     this.transitionCache = subscriptionsPatterns;
//     return response;
//   }
// }
// export { RedisJSONStoreService };
