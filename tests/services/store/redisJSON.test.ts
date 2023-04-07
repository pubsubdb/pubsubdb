import { RedisConnection, RedisClientType } from '../../../cache/redis';
import { RedisJSONStoreService } from '../../../services/store/redisJSON';

describe('RedisJSONStoreService', () => {
  let redisConnection: RedisConnection;
  let redisClient: RedisClientType;
  let redisStoreService: RedisJSONStoreService;

  beforeEach(async () => {
    await redisClient.flushDb();
    redisStoreService = new RedisJSONStoreService(redisClient);
  });

  beforeAll(async () => {
    redisConnection = await RedisConnection.getConnection('test-connection-1');
    redisClient = await redisConnection.getClient();
  });

  afterAll(async () => {
    await RedisConnection.disconnectAll();
  });

  describe('getKey', () => {
    it('should return the key for the given namespace and key for the store', () => {
      const namespace = 'NAMESPACE';
      const key = 'KEY';
      const result = redisStoreService.getKey(namespace, key);
      expect(result).toEqual(`${namespace}:${key}`);
    });
  });

  describe('setJob', () => {
    it('should set the data and metadata for the given job ID', async () => {
      const jobId = 'JOB_ID';
      const data = { data: 'DATA' };
      const metadata = { metadata: 'METADATA' };
      const result = await redisStoreService.setJob(jobId, data, metadata);
      expect(result).toEqual(jobId);

      const dataResult = await redisStoreService.getJobData(jobId);
      expect(dataResult).toEqual(data);

      const metadataResult = await redisStoreService.getJobMetadata(jobId);
      expect(metadataResult).toEqual(metadata);
    });
  });

  describe('getJobMetadata', () => {
    it('should get the metadata for the given job ID', async () => {
      const jobId = 'JOB_ID';
      const metadata = { metadata: 'METADATA' };
      await redisStoreService.setJob(jobId, {}, metadata);
      const result = await redisStoreService.getJobMetadata(jobId);
      expect(result).toEqual(metadata);
    });
  });

  describe('getJobData', () => {
    it('should get the data for the given job ID', async () => {
      const jobId = 'JOB_ID';
      const data = { data: 'DATA' };
      await redisStoreService.setJob(jobId, data, {});
      const result = await redisStoreService.getJobData(jobId);
      expect(result).toEqual(data);
    });
  });

  describe('getJob', () => {
    it('should get the data for the given job ID', async () => {
      const jobId = 'JOB_ID';
      const data = { data: 'DATA' };
      await redisStoreService.setJob(jobId, data, {});
      const result = await redisStoreService.getJob(jobId);
      expect(result).toEqual(data);
    });
  });

  describe('get', () => {
    it('should get the data for the given job ID', async () => {
      const jobId = 'JOB_ID';
      const data = { data: 'DATA' };
      await redisStoreService.setJob(jobId, data, {});
      const result = await redisStoreService.get(jobId);
      expect(result).toEqual(data);
    });
  });

  describe('getActivityData', () => {
    it('should get the data for the given activity ID', async () => {
      const activityId = 'ACTIVITY_ID';
      const data = { data: 'DATA' };
      await redisStoreService.setActivity(activityId, data, {});
      const result = await redisStoreService.getActivityData(activityId);
      expect(result).toEqual(data);
    });
  });

  describe('getActivityMetadata', () => {
    it('should retrieve the activity metadata from the store', async () => {
      const activityId = 'activity-1';
      const metadata = {
        someKey: 'someValue',
      };
      await redisStoreService.setActivity(activityId, {}, metadata);
      const result = await redisStoreService.getActivityMetadata(activityId);
      expect(result).toEqual(metadata);
    });
  });

  describe('getActivity', () => {
    it('should retrieve the activity data from the store', async () => {
      const activityId = 'activity-1';
      const data = {
        someKey: 'someValue',
      };
      await redisStoreService.setActivity(activityId, data, {});
      const result = await redisStoreService.getActivity(activityId);
      expect(result).toEqual(data);
    });
  });

  describe('getSchema', () => {
    it('should retrieve the schema for the given topic from the store', async () => {
      const topic = 'topic1';
      const schema = {
        someKey: 'someValue',
      };
      await redisStoreService.setSchema(topic, schema);
      const result = await redisStoreService.getSchema(topic);
      expect(result).toEqual(schema);
    });
  });

  describe('getSchemas', () => {
    it('should retrieve all schemas from the store', async () => {
      const schemas = {
        topic1: {
          someKey: 'someValue',
        },
        topic2: {
          someKey: 'someValue',
        },
      };
      await redisStoreService.setSchemas(schemas);
      const result = await redisStoreService.getSchemas();
      expect(result).toEqual(schemas);
    });
  });

  describe('setSchema', () => {
    it('should store the schema for the given topic in the store', async () => {
      const topic = 'topic1';
      const schema = {
        someKey: 'aValue',
      };
      const result = await redisStoreService.setSchema(topic, schema);
      expect(result).toEqual('OK');
    });
  });

  describe('setSchemas', () => {
    it('should store all schemas in the store', async () => {
      const schemas = {
        topic1: {
          someKey: 'someValue',
        },
        topic2: {
          someKey: 'someValue',
        },
      };
      const result = await redisStoreService.setSchemas(schemas);
      expect(result).toEqual('OK');
    });
  });

});
