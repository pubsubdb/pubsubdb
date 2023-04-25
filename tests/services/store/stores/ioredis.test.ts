import { RedisConnection, RedisClientType } from '../../../../cache/ioredis';
import { LoggerService } from '../../../../services/logger';
import { KeyType, PSNS } from '../../../../services/store/key';
import { IORedisStoreService } from '../../../../services/store/stores/ioredis';
import { SubscriptionCallback } from '../../../../typedefs/conductor';
import { StatsType } from '../../../../typedefs/stats';

describe('IORedisStoreService', () => {
  const appConfig = { id: 'test-app', version: '1' };
  const cacheConfig = { appId: 'test-app', appVersion: '1' };
  let redisConnection: RedisConnection;
  let subscriberConnection: RedisConnection;
  let redisClient: RedisClientType;
  let redisSubscriber: RedisClientType;
  let redisStoreService: IORedisStoreService;

  beforeEach(async () => {
    await redisClient.flushdb();
    redisStoreService = new IORedisStoreService(redisClient, redisSubscriber);
    const appConfig = { id: 'APP_ID', version: 'APP_VERSION' };
    await redisStoreService.init(PSNS, appConfig.id, new LoggerService());
  });

  beforeAll(async () => {
    redisConnection = await RedisConnection.getConnection('test-connection-1');
    subscriberConnection = await RedisConnection.getConnection('test-subscriber-1');
    redisClient = await redisConnection.getClient();
    redisSubscriber = await subscriberConnection.getClient();
  });

  afterAll(async () => {
    await RedisConnection.disconnectAll();
  });

  describe('mintKey', () => {
    it('should mint the key to access pubsubdb global settings', () => {
      const result = redisStoreService.mintKey(KeyType.PUBSUBDB, {});
      expect(result).toEqual(PSNS); 
    });

    it('should mint the key to access pubsubdb apps', () => {
      const result = redisStoreService.mintKey(KeyType.APP, cacheConfig);
      expect(result).toEqual(`${PSNS}:a:${cacheConfig.appId}`); 
    });
  });

  describe('setJob', () => {
    it('should set the data and metadata for the given job ID', async () => {
      const jobId = 'JOB_ID';
      const data = { data: 'DATA' };
      const metadata = { jid: jobId };
      const result = await redisStoreService.setJob(jobId, data, metadata, appConfig);
      expect(result).toEqual(jobId);

      const dataResult = await redisStoreService.getJobData(jobId, appConfig);
      expect(dataResult).toEqual(data);

      const metadataResult = await redisStoreService.getJobMetadata(jobId, appConfig);
      expect(metadataResult).toEqual(metadata);
    });
  });

  describe('getJobMetadata', () => {
    it('should get the metadata for the given job ID', async () => {
      const jobId = 'JOB_ID';
      const metadata = { jid: jobId };
      await redisStoreService.setJob(jobId, {}, metadata, appConfig);
      const result = await redisStoreService.getJobMetadata(jobId, appConfig);
      expect(result).toEqual(metadata);
    });
  });

  describe('getJobData', () => {
    it('should get the data for the given job ID', async () => {
      const jobId = 'JOB_ID';
      const data = { data: 'DATA' };
      await redisStoreService.setJob(jobId, data, {}, appConfig);
      const result = await redisStoreService.getJobData(jobId, appConfig);
      expect(result).toEqual(data);
    });
  });

  describe('getJob', () => {
    it('should get the data for the given job ID', async () => {
      const jobId = 'JOB_ID';
      const data = { data: 'DATA' };
      await redisStoreService.setJob(jobId, data, {}, appConfig);
      const result = await redisStoreService.getJob(jobId, appConfig);
      expect(result).toEqual(data);
    });
  });

  describe('get', () => {
    it('should get the data for the given job ID', async () => {
      const jobId = 'JOB_ID';
      const data = { data: 'DATA' };
      await redisStoreService.setJob(jobId, data, {}, appConfig);
      const result = await redisStoreService.get(jobId, appConfig);
      expect(result).toEqual(data);
    });
  });

  describe('setJobStats', () => {
    it('should set job stats correctly', async () => {
      const jobKey = 'job-key';
      const jobId = 'job-id';
      const dateTime = '202304170000';
      const stats: StatsType = {
        general: [{ metric: 'count', target: 'target1', value: 1 }],
        index: [{ metric: 'index', target: 'target2', value: 20 }],
        median: [{ metric: 'mdn', target: 'target3', value: 30 }],
      };

      const result = await redisStoreService.setJobStats(jobKey, jobId, dateTime, stats, appConfig);
      expect(result).not.toBeNull();

      const generalStatsKey = redisStoreService.mintKey(KeyType.JOB_STATS_GENERAL, { ...cacheConfig, jobId, jobKey, dateTime });
      const generalStats = await redisClient.hgetall(generalStatsKey);
      expect(generalStats[stats.general[0].target]).toEqual(stats.general[0].value.toString());
  
      const indexStatsKey = redisStoreService.mintKey(KeyType.JOB_STATS_INDEX, { ...cacheConfig, jobId, jobKey, dateTime, facet: stats.index[0].target });
      const indexStats = await redisClient.lrange(indexStatsKey, 0, -1);
      expect(indexStats[0]).toEqual(stats.index[0].value.toString());
  
      const medianStatsKey = redisStoreService.mintKey(KeyType.JOB_STATS_MEDIAN, { ...cacheConfig, jobId, jobKey, dateTime, facet: stats.median[0].target });
      const medianStats = await redisClient.zrange(medianStatsKey, 0, -1);
      expect(medianStats[0]).toEqual(stats.median[0].value.toString());
    });
  });

  describe('getActivityData', () => {
    it('should get the data for the given activity ID', async () => {
      const jobId = 'JOB_ID';
      const activityId = 'ACTIVITY_ID';
      const data = { data: 'DATA' };
      await redisStoreService.setActivity(jobId, activityId, data, {}, appConfig);
      const result = await redisStoreService.getActivityData(jobId, activityId, appConfig);
      expect(result).toEqual(data);
    });

    it('should restore all data types', async () => {
      const jobId = 'JOB_ID';
      const activityId = 'ACTIVITY_ID';
      const data = { 
        string: 'string',
        boolean: true,
        number: 55,
        array_of_numbers: [1, 2, 3],
        date: new Date(),
      };
      await redisStoreService.setActivity(jobId, activityId, data, {}, appConfig);
      const result = await redisStoreService.getActivityData(jobId, activityId, appConfig);
      expect(result).toEqual(data);
    });
  });

  describe('setActivityNX', () => {
    it('should set the activity data in the store with NX behavior', async () => {
      const jobId = 'job-1';
      const activityId = 'activity-1';
  
      // First, set the activity using setActivityNX
      const response = await redisStoreService.setActivityNX(jobId, activityId, appConfig);
      expect(response).toEqual(1); // Expect the HSETNX result to be 1 (field was set)
  
      // Now, try to set the same activity again using setActivityNX
      const secondResponse = await redisStoreService.setActivityNX(jobId, activityId, appConfig);
      expect(secondResponse).toEqual(0); // Expect the HSETNX result to be 0 (field was not set because it already exists)
  
      // Verify that the activity data in the store is correct
      const hashKey = redisStoreService.mintKey(KeyType.JOB_ACTIVITY_DATA, { appId: appConfig.id, jobId, activityId });
      const storedActivityId = await redisStoreService.redisClient.hget(hashKey, 'm/aid');
      expect(storedActivityId).toEqual(activityId);
    });
  });

  describe('getActivityMetadata', () => {
    it('should retrieve the activity metadata from the store', async () => {
      const jobId = 'job-1';
      const activityId = 'activity-1';
      const metadata = { aid: 'activity-1' };
      await redisStoreService.setActivity(jobId, activityId, {}, metadata, appConfig);
      const result = await redisStoreService.getActivityMetadata(jobId, activityId, appConfig);
      expect(result).toEqual(metadata);
    });
  });

  describe('getActivity', () => {
    it('should retrieve the activity data from the store', async () => {
      const jobId = 'job-1';
      const activityId = 'activity-1';
      const data = { someKey: 'someValue' };
      await redisStoreService.setActivity(jobId, activityId, data, {}, appConfig);
      const result = await redisStoreService.getActivity(jobId, activityId, appConfig);
      expect(result).toEqual(data);
    });
  });

  describe('getSchema', () => {
    it('should retrieve the schema for the given topic from the store', async () => {
      const topic = 'topic1';
      const schemas = {
        topic1: {
          someKey: 'someValue',
        },
        topic2: {
          someKey: 'someValue',
        },
      };
      await redisStoreService.setSchemas(schemas, appConfig);
      const result = await redisStoreService.getSchema(topic, appConfig);
      expect(result).toEqual(schemas[topic]);
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
      await redisStoreService.setSchemas(schemas, appConfig);
      const result = await redisStoreService.getSchemas(appConfig);
      expect(result).toEqual(schemas);
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
      const result = await redisStoreService.setSchemas(schemas, appConfig);
      expect(result).toEqual('OK');
    });
  });

  describe('subscribe', () => {
    it('subscribes to the `conductor` topic for cooordinating deployments', async () => {
      const subscriptionHandler: SubscriptionCallback = (topic, message) => {
        const topicKey = redisStoreService.mintKey(KeyType.CONDUCTOR, { appId: appConfig.id });
        expect(topic).toEqual(topicKey);
        expect(message).toEqual(payload);
      };
      const payload = { 'any': 'data' };
      await redisStoreService.subscribe(KeyType.CONDUCTOR, subscriptionHandler, appConfig);
      await redisStoreService.publish(KeyType.CONDUCTOR, payload, appConfig);
    });
  });
});