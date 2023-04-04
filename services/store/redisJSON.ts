import { NAMESPACES as NS } from '../../cache/config';
import { StoreService } from './store';

class RedisJSONStoreService extends StoreService {
  private redisClient: any;
  private schemaCache: Record<string, unknown>;

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
    const key = this.getKey(NS.ACTIVITY_SCHEMAS);
    await this.redisClient.json.set(key, '.', schemas, { NX: true });
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

  async getManifest(): Promise<any> {
    const key = this.getKey(NS.PUBSUBDB, 'manifest');
    return await this.redisClient.json.get(key);
  }

  async setManifest(manifest: any): Promise<any> {
    const key = this.getKey(NS.PUBSUBDB, 'manifest');
    return await this.redisClient.json.set(key, '.', manifest);
  }

  async setJob(jobId: string, data: Record<string, unknown>, metadata: Record<string, unknown>): Promise<string> {
    const [dataResp, metadataResp] = await this.redisClient.multi()
      .json.set(this.getKey(NS.JOB_DATA, jobId), '.', data)
      .json.set(this.getKey(NS.JOB_METADATA, jobId), '.', metadata)
      .exec();
    return jobId;
  }

  async getJobMetadata(jobId: string): Promise<any> {
    const key = this.getKey(NS.JOB_METADATA, jobId);
    return await this.redisClient.json.get(key);
  }

  async getJobData(jobId: string): Promise<any> {
    const key = this.getKey(NS.JOB_DATA, jobId);
    return await this.redisClient.json.get(key);
  }

  async get(jobId: string): Promise<any> {
    return await this.getJobData(jobId);
  }

  async getJob(jobId: string): Promise<any> {
    return await this.getJobData(jobId);
  }

  async getActivity(activityId: string): Promise<any> {
    return await this.getActivityData(activityId);
  }
  
  async setActivity(activityId: any, data: Record<string, unknown>, metadata: Record<string, unknown>): Promise<any>  {
    const [dataResp, metadataResp] = await this.redisClient.multi()
      .json.set(this.getKey(NS.ACTIVITY_DATA, activityId), '.', data)
      .json.set(this.getKey(NS.ACTIVITY_METADATA, activityId), '.', metadata)
      .exec();
    return activityId;
  }
  
  async getActivityMetadata(activityId: string): Promise<any> {
    const key = this.getKey(NS.ACTIVITY_METADATA, activityId);
    return await this.redisClient.json.get(key);
  }

  async getActivityData(activityId: string): Promise<any> {
    const key = this.getKey(NS.ACTIVITY_DATA, activityId);
    return await this.redisClient.json.get(key);
  }

  async getSchema(topic: string): Promise<any> {
    if (this.schemaCache && this.schemaCache[topic]) {
      return this.schemaCache[topic];
    } else {
      const key = this.getKey(NS.ACTIVITY_SCHEMAS);
      const schema = await this.redisClient.json.get(key, `.["${topic}"]`);
      if (!this.schemaCache) {
        await this.initSchemaCache();
      }
      return this.schemaCache[topic] = schema[topic];
    }
  }

  async getSchemas(): Promise<any> {
    const key = this.getKey(NS.ACTIVITY_SCHEMAS);
    const schemas = await this.redisClient.json.get(key);
    this.schemaCache = schemas;
    return schemas;
  }

  async setSchema(topic: string, schema: any): Promise<any> {
    const key = this.getKey(NS.ACTIVITY_SCHEMAS);
    const response = await this.redisClient.json.set(key, `.["${topic}"]`, schema);
    this.schemaCache[topic] = schema;
    return response;
  }

  async setSchemas(schemas: Record<string, any>): Promise<any> {
    const key = this.getKey(NS.ACTIVITY_SCHEMAS);
    const response = await this.redisClient.json.set(key, '.', schemas);
    this.schemaCache = schemas;
    return response;
  }

}

export { RedisJSONStoreService };
