import { KeyType, PSNS } from '../../../../modules/key';
import { LoggerService } from '../../../../services/logger';
import { SerializerService } from '../../../../services/store/serializer';
import { IORedisStoreService } from '../../../../services/store/clients/ioredis';
import { ActivityType } from '../../../../typedefs/activity';
import { HookSignal } from '../../../../typedefs/hook';
import { StatsType } from '../../../../typedefs/stats';
import { RedisConnection, RedisClientType } from '../../../$setup/cache/ioredis';

describe('IORedisStoreService', () => {
  const appConfig = { id: 'test-app', version: '1' };
  const cacheConfig = { appId: 'test-app', appVersion: '1' };
  let redisConnection: RedisConnection;
  let redisClient: RedisClientType;
  let redisStoreService: IORedisStoreService;

  beforeEach(async () => {
    await redisClient.flushdb();
    redisStoreService = new IORedisStoreService(redisClient);
    await redisStoreService.init(PSNS, appConfig.id, new LoggerService());
  });

  beforeAll(async () => {
    redisConnection = await RedisConnection.getConnection('test-connection-1');
    redisClient = await redisConnection.getClient();
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
      const metadata = { jid: jobId };
      await redisStoreService.setJob(jobId, data, metadata, appConfig);
      const result = await redisStoreService.getJobData(jobId, appConfig);
      expect(result).toEqual(data);
    });
  });

  describe('getJob', () => {
    it('should get the data for the given job ID', async () => {
      const jobId = 'JOB_ID';
      const data = { data: 'DATA' };
      const metadata = { jid: jobId };
      await redisStoreService.setJob(jobId, data, metadata, appConfig);
      const result = await redisStoreService.getJob(jobId, appConfig);
      expect(result).toEqual(data);
    });
  });

  describe('getJobOutput', () => {
    it('should return the full job context, including data and metadata', async () => {
      const jobId = 'JOB_ID';
      const metadata = { jid: jobId };
      const data = { data: { some: 'DATA' }};
      await redisStoreService.setJob(jobId, data, metadata, appConfig);
      const result = await redisStoreService.getJobOutput(jobId, appConfig);
      expect(result?.metadata.jid).toEqual(metadata.jid);
      expect((result?.data.data as {some: string}).some).toEqual(data.data.some);
    });
  });

  describe('setJobStats', () => {
    it('should set and get job stats correctly', async () => {
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

      //expect getStats to cast the value to a number, so it is an exact match even though a string in redis
      const jobStats = await redisStoreService.getJobStats([generalStatsKey]);
      expect(jobStats[generalStatsKey][stats.general[0].target]).toEqual(stats.general[0].value);
    });
  });

  describe('getActivityContext', () => {
    it('should get the data for the given activity ID', async () => {
      const jobId = 'JOB_ID';
      const activityId = 'ACTIVITY_ID';
      const data = { data: 'DATA' };
      const metadata = { aid: activityId };
      const hook = null;
      await redisStoreService.setActivity(jobId, activityId, data, metadata, hook, appConfig);
      const result = await redisStoreService.getActivityContext(jobId, activityId, appConfig);
      expect(result?.data).toEqual(data);
    });

    it('should get the hook data for the given activity ID', async () => {
      const jobId = 'JOB_ID';
      const activityId = 'ACTIVITY_ID';
      const data = { data: 'DATA' };
      const metadata = { aid: activityId };
      const hook = { hook: 'SIGNAL' };
      await redisStoreService.setActivity(jobId, activityId, data, metadata, hook, appConfig);
      const result = await redisStoreService.getActivityContext(jobId, activityId, appConfig);
      expect(result?.hook).toEqual(hook);
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
      const metadata = { aid: activityId };
      const hook = null;
      await redisStoreService.setActivity(jobId, activityId, data, metadata, hook, appConfig);
      const result = await redisStoreService.getActivityContext(jobId, activityId, appConfig);
      expect(result?.data).toEqual(data);
    });

    it('should activate existing app version', async () => {
      const appId = 'testAppId';
      const version = 'testVersion';
      await redisStoreService.setApp(appId, version);
      const response = await redisStoreService.activateAppVersion(appId, version);
      expect(response).toBeTruthy();
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
      const data = {};
      const metadata = { aid: activityId };
      const hook = null;
      await redisStoreService.setActivity(jobId, activityId, data, metadata, hook, appConfig);
      const result = await redisStoreService.getActivityMetadata(jobId, activityId, appConfig);
      expect(result).toEqual(metadata);
    });
  });

  describe('getActivity', () => {
    it('should retrieve the activity data from the store', async () => {
      const jobId = 'JOB_ID';
      const activityId = 'ACTIVITY_ID';
      const data = { data: 'DATA' };
      const metadata = { aid: activityId };
      const hook = null;
      await redisStoreService.setActivity(jobId, activityId, data, metadata, hook, appConfig);
      const result = await redisStoreService.getActivity(jobId, activityId, appConfig);
      expect(result).toEqual(data);
    });
  });

  describe('getSchema', () => {
    it('should retrieve the schema for the given topic from the store', async () => {
      const topic = 'topic1';
      const schemas: Record<string, ActivityType> = {
        topic1: {
          type: 'activity',
        },
        topic2: {
          type: 'trigger',
        },
      };
      await redisStoreService.setSchemas(schemas, appConfig);
      const result = await redisStoreService.getSchema(topic, appConfig);
      expect(result).toEqual(schemas[topic]);
    });
  });

  describe('getSchemas', () => {
    it('should retrieve all schemas from the store', async () => {
      const schemas: Record<string, ActivityType> = {
        topic1: {
          type: 'activity',
        },
        topic2: {
          type: 'trigger',
        },
      };
      await redisStoreService.setSchemas(schemas, appConfig);
      const result = await redisStoreService.getSchemas(appConfig);
      expect(result).toEqual(schemas);
    });
  });

  describe('setSchemas', () => {
    it('should store all schemas in the store', async () => {
      const schemas: Record<string, ActivityType> = {
        topic1: {
          type: 'activity',
        },
        topic2: {
          type: 'trigger',
        },
      };
      const result = await redisStoreService.setSchemas(schemas, appConfig);
      expect(result).toEqual('OK');
    });
  });

  describe('addTaskQueues', () => {
    it('should enqueue work items correctly', async () => {
      const keys = ['work-item-1', 'work-item-2', 'work-item-3'];
      await redisStoreService.addTaskQueues(keys);
      const zsetKey = redisStoreService.mintKey(KeyType.WORK_ITEMS, { appId: appConfig.id });
      for (const key of keys) {
        const score = await redisClient.zscore(zsetKey, key);
        expect(score).not.toBeNull();
      }
    });

    it('should not overwrite existing work items with the same key', async () => {
      const existingKey = 'work-item-existing';
      const existingScore = Date.now() - 1000;
      const zsetKey = redisStoreService.mintKey(KeyType.WORK_ITEMS, { appId: appConfig.id });
      await redisClient.zadd(zsetKey, existingScore.toString(), existingKey);
      await redisStoreService.addTaskQueues([existingKey]);
      const newScore = await redisClient.zscore(zsetKey, existingKey);
      expect(newScore).toEqual(existingScore.toString());
    });
  });

  describe('getActiveTaskQueue', () => {
    beforeEach(async () => {
      redisStoreService.cache.invalidate();
    });

    it('should return the work item with the lowest score', async () => {
      const workItems = [
        { key: 'work-item-1', score: 1000 },
        { key: 'work-item-2', score: 2000 },
        { key: 'work-item-3', score: 3000 },
      ];
      const zsetKey = redisStoreService.mintKey(KeyType.WORK_ITEMS, { appId: appConfig.id });
      for (const item of workItems) {
        await redisStoreService.redisClient.zadd(zsetKey, item.score.toString(), item.key);
      }
      const workItemKey = await redisStoreService.getActiveTaskQueue();
      expect(workItemKey).toEqual(workItems[0].key);
    });

    it('should return work item from cache if available', async () => {
      const cachedKey = 'work-item-cached';
      const zsetKey = redisStoreService.mintKey(KeyType.WORK_ITEMS, { appId: appConfig.id });
      await redisStoreService.redisClient.zadd(zsetKey, '1000', cachedKey);
      redisStoreService.cache.setWorkItem(appConfig.id, cachedKey);
      const workItemKey = await redisStoreService.getActiveTaskQueue();
      expect(workItemKey).toEqual(cachedKey);
    });

    it('should return null if no work items are available', async () => {
      const workItemKey = await redisStoreService.getActiveTaskQueue();
      expect(workItemKey).toBeNull();
    });
  });

  describe('deleteProcessedTaskQueue', () => {
    beforeEach(async () => {
      redisStoreService.cache.invalidate();
    });

    it('should remove the work item and processed item from Redis', async () => {
      const workItemKey = 'work-item-1';
      const key = 'item-1';
      const processedKey = 'processed-item-1';
      const zsetKey = redisStoreService.mintKey(KeyType.WORK_ITEMS, { appId: appConfig.id });
      await redisStoreService.redisClient.zadd(zsetKey, 'NX', 1000, workItemKey);
      await redisStoreService.redisClient.set(processedKey, 'processed data');
      await redisStoreService.deleteProcessedTaskQueue(workItemKey, key, processedKey);
      const workItemExists = await redisStoreService.redisClient.exists(workItemKey);
      const processedItemExists = await redisStoreService.redisClient.exists(processedKey);
      const workItemInZSet = await redisStoreService.redisClient.zrank(zsetKey, workItemKey);
      expect(workItemExists).toBe(0);
      expect(processedItemExists).toBe(0);
      expect(workItemInZSet).toBeNull();
    });

    it('should remove the work item from the cache', async () => {
      const workItemKey = 'work-item-cached';
      const key = 'item-cached';
      const processedKey = 'processed-item-cached';
      redisStoreService.cache.setWorkItem(appConfig.id, workItemKey);
      await redisStoreService.deleteProcessedTaskQueue(workItemKey, key, processedKey);
      const cachedWorkItem = redisStoreService.cache.getActiveTaskQueue(appConfig.id);
      expect(cachedWorkItem).toBeUndefined();
    });
  });

  describe('processTaskQueue', () => {
    const sourceKey = 'source-list';
    const destinationKey = 'destination-list';
    const item1 = 'item-1';
    const item2 = 'item-2';

    beforeEach(async () => {
      await redisStoreService.redisClient.del(sourceKey);
      await redisStoreService.redisClient.del(destinationKey);
    });

    it('should move an item from the source list to the destination list', async () => {
      await redisStoreService.redisClient.lpush(sourceKey, item1, item2);
      const val2 = await redisStoreService.processTaskQueue(sourceKey, destinationKey);
      let sourceList = await redisStoreService.redisClient.lrange(sourceKey, 0, -1);
      let destinationList = await redisStoreService.redisClient.lrange(destinationKey, 0, -1);
      expect(val2).toEqual(item2);
      expect(sourceList).toEqual([item1]);
      expect(destinationList).toEqual([item2]);
      const val1 = await redisStoreService.processTaskQueue(sourceKey, destinationKey);
      expect(val1).toEqual(item1);
      sourceList = await redisStoreService.redisClient.lrange(sourceKey, 0, -1);
      destinationList = await redisStoreService.redisClient.lrange(destinationKey, 0, -1);
      const val3 = await redisStoreService.processTaskQueue(sourceKey, destinationKey);
      expect(val3).toEqual(null);
      expect(sourceList).toEqual([]);
      expect(destinationList).toEqual([item2, item1]);
    });

    it('should not move any item when the source list is empty', async () => {
      await redisStoreService.processTaskQueue(sourceKey, destinationKey);
      const sourceList = await redisStoreService.redisClient.lrange(sourceKey, 0, -1);
      const destinationList = await redisStoreService.redisClient.lrange(destinationKey, 0, -1);
      expect(sourceList).toEqual([]);
      expect(destinationList).toEqual([]);
    });
  });

  describe('setHookSignal', () => {
    it('should set the hook correctly', async () => {
      const hook: HookSignal = {
        topic: 'test-topic',
        resolved: 'test-resolved',
        jobId: 'test-job-id',
      };
      await redisStoreService.setHookSignal(hook);
      const key = redisStoreService.mintKey(KeyType.SIGNALS, { appId: appConfig.id });
      const value = await redisClient.hget(key, `${hook.topic}:${hook.resolved}`);
      expect(value).toEqual(hook.jobId);
    });
  });
  
  describe('getHookSignal', () => {
    it('should get and remove the hook correctly', async () => {
      const hook: HookSignal = {
        topic: 'test-topic',
        resolved: 'test-resolved',
        jobId: 'test-job-id',
      };
      await redisStoreService.setHookSignal(hook);
      const retrievedSignal = await redisStoreService.getHookSignal(hook.topic, hook.resolved);
      expect(retrievedSignal).toEqual(hook.jobId);
      const key = redisStoreService.mintKey(KeyType.SIGNALS, { appId: appConfig.id });
      const remainingValue = await redisClient.hget(key, `${hook.topic}:${hook.resolved}`);
      expect(remainingValue).toBeNull();
    });
  });

  describe('restoreContext', () => {
    it('should restore nested and flat context data', async () => {
      const jobId = 'test-job-id';
      const activity1Id = 'activity1';
      const activity2Id = 'activity2';
      const dependsOn = {
        [activity1Id]: ['d/field1', 'd/field2'],
        [activity2Id]: ['d/nested/field3', 'd/nested/field4', 'd/nested/field5'],
      };
      const initialData = {
        [activity1Id]: { 'd/field1': 'value1', 'd/field2': 'value2' },
        [activity2Id]: { 'd/nested/field3': 'value3', 'd/nested/field4': 'value4' },
      };
      for (const [activityId, data] of Object.entries(initialData)) {
        const key = redisStoreService.mintKey(KeyType.JOB_ACTIVITY_DATA, {
          appId: appConfig.id,
          jobId,
          activityId,
        });
        await redisClient.hmset(key, data);
      }
      const restoredData = await redisStoreService.restoreContext(jobId, dependsOn, appConfig);
      initialData[activity1Id] = SerializerService.restoreHierarchy(initialData[activity1Id]);
      initialData[activity2Id] = SerializerService.restoreHierarchy(initialData[activity2Id]);
      // @ts-ignore
      expect(restoredData[activity1Id].output.data.field1).toEqual(initialData[activity1Id].d.field1);
      // @ts-ignore
      expect(restoredData[activity2Id].output.data.nested.field3).toEqual(initialData[activity2Id].d.nested.field3);
    });
  });
});
