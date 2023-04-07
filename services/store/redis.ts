import { NAMESPACES as NS } from './namespace';
import { StoreService } from './store';

class RedisStoreService extends StoreService {
  private redisClient: any;
  private schemaCache: Record<string, unknown> = {};

  constructor(redisClient: any) {
    super();
    this.redisClient = redisClient;
    this.init();
  }

  async init() {
    await this.initSchemaCache();
  }

  async initSchemaCache() {
    const schemas = {};
    this.schemaCache = schemas;
  }

  /**
   * returns the key for the given namespace and key for the store
   * @param namespace 
   * @param key 
   * @returns 
   */
  getKey(namespace: string, key = ''): string {
    return `${namespace}:${key}`;
  }

  /**
   * get the manifest from the store; the manifest is the entry point for the entire
   * pubsubdb data tree and contains the information necessary to resolve all
   * jobs, activities, schemas, etc
   * 
   * @returns {Promise<any>}
   */
  async getManifest(): Promise<any> {
    const key = this.getKey(NS.PUBSUBDB, 'manifest');
    const manifest = await this.redisClient.get(key);
    return JSON.parse(manifest);
  }

  /**
   * get the manifest from the store; the manifest is the entry point for the entire
   * pubsubdb data tree and contains the information necessary to resolve all
   * jobs, activities, schemas, etc
   * 
   * @param {any} manifest
   * @returns {Promise<any>}
   */
  async setManifest(manifest: any): Promise<any> {
    const key = this.getKey(NS.PUBSUBDB, 'manifest');
    return await this.redisClient.set(key, JSON.stringify(manifest));
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
  async setJob(jobId: string, data: Record<string, unknown>, metadata: Record<string, unknown>): Promise<string> {
    const [dataResp, metadataResp] = await this.redisClient.multi()
      .set(this.getKey(NS.JOB_DATA, jobId), JSON.stringify(data))
      .set(this.getKey(NS.JOB_METADATA, jobId), JSON.stringify(metadata))
      //todo: set aggregation stats for the schema (NS.JOB_STATISTICS)
      .exec();
    return jobId;
  }

  async getJobMetadata(jobId: string): Promise<any> {
    const key = this.getKey(NS.JOB_METADATA, jobId);
    const jobMetadata = await this.redisClient.get(key);
    return JSON.parse(jobMetadata);
  }

  async getJobData(jobId: string): Promise<any> {
    const key = this.getKey(NS.JOB_DATA, jobId);
    const jobData = await this.redisClient.get(key);
    return JSON.parse(jobData);
  }

  /**
   * convenience method to get the job data
   * @param jobId 
   * @returns 
   */
  async getJob(jobId: string): Promise<any> {
    return await this.getJobData(jobId);
  }

  /**
   * convenience method to get the job data
   * @param jobId 
   * @returns 
   */
  async get(jobId: string): Promise<any> {
    return await this.getJobData(jobId);
  }

  async setActivity(activityId: any, data: Record<string, unknown>, metadata: Record<string, unknown>): Promise<any>  {
    const [dataResp, metadataResp] = await this.redisClient.multi()
      .set(this.getKey(NS.ACTIVITY_DATA, activityId), JSON.stringify(data))
      .set(this.getKey(NS.ACTIVITY_METADATA, activityId), JSON.stringify(metadata))
      .exec();
    return activityId;
  }
  
  async getActivityMetadata(activityId: string): Promise<any> {
    const key = this.getKey(NS.ACTIVITY_METADATA, activityId);
    const activityMetadata = await this.redisClient.get(key);
    return JSON.parse(activityMetadata);
  }

  async getActivityData(activityId: string): Promise<any> {
    const key = this.getKey(NS.ACTIVITY_DATA, activityId);
    const activityData = await this.redisClient.get(key);
    return JSON.parse(activityData);
  }

  async getActivity(activityId: string): Promise<any> {
    return await this.getActivityData(activityId);
  }

  /**
   * Checks the cache for the schema and if not found, fetches it from the store
   * 
   * @param topic 
   * @returns 
   */
  async getSchema(topic: string): Promise<any> {
    if (this.schemaCache && this.schemaCache[topic]) {
      return this.schemaCache[topic];
    } else {
      const key = this.getKey(NS.ACTIVITY_SCHEMAS);
      const schema = JSON.parse(await this.redisClient.hget(key, topic));
      return this.schemaCache[topic] = schema;
    }
  }

  /**
   * Always fetches the schemas from the store and caches them in memory
   * @returns 
   */
  async getSchemas(): Promise<any> {
    const key = this.getKey(NS.ACTIVITY_SCHEMAS);
    const schemas = await this.redisClient.hGetAll(key);
    Object.entries(schemas).forEach(([key, value]) => {
      schemas[key] = JSON.parse(value as string);
    });
    return this.schemaCache = schemas;
  }

  /**
   * Sets the schema for the given topic in the store and in memory
   * @param topic 
   * @param schema 
   * @returns 
   */
  async setSchema(topic: string, schema: any): Promise<any> {
    const key = this.getKey(NS.ACTIVITY_SCHEMAS);
    const response = await this.redisClient.hSet(key, topic, JSON.stringify(schema));
    this.schemaCache[topic] = schema;
    return response;
  }

  /**
   * Sets the schemas for all topics in the store and in memory
   * @param schemas 
   * @returns 
   */
  async setSchemas(schemas: Record<string, any>): Promise<any> {
    const key = this.getKey(NS.ACTIVITY_SCHEMAS);
    const _schemas = {...schemas};
    Object.entries(_schemas).forEach(([key, value]) => {
      _schemas[key] = JSON.stringify(value);
    });
    const response = await this.redisClient.hSet(key, _schemas);
    this.schemaCache = schemas;
    return response;
  }
}

export { RedisStoreService };
