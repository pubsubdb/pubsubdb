import { KeyType, PSNS } from '../../../../modules/key';
import { LoggerService } from '../../../../services/logger';
import { IORedisStoreService } from '../../../../services/store/clients/ioredis';
import { ActivityType, Consumes } from '../../../../types/activity';
import { HookSignal } from '../../../../types/hook';
import { StatsType } from '../../../../types/stats';
import { RedisConnection, RedisClientType } from '../../../$setup/cache/ioredis';
import { StringAnyType, Symbols } from '../../../../types/serializer';
import { MDATA_SYMBOLS } from '../../../../services/serializer';
import { getSymKey } from '../../../../modules/utils';

describe('FUNCTIONAL | IORedisStoreService', () => {
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

  describe('reserveSymbolRange', () => {
    it('should reserve a symbol range for a given activity and handle existing values', async () => {
      const activityId = 'a1';
      const size = 286;
      // First case: No existing key
      let [lowerLimit, upperLimit] = await redisStoreService.reserveSymbolRange(activityId, size, 'ACTIVITY');
      expect(lowerLimit).toEqual(26); //0 + reserved metadata slots (first available slot)
      let rangeKey = redisStoreService.mintKey(KeyType.SYMKEYS, { appId: appConfig.id });
      let range = await redisClient.hget(rangeKey, activityId);
      expect(range).toEqual(`${lowerLimit - MDATA_SYMBOLS.SLOTS}:${lowerLimit - MDATA_SYMBOLS.SLOTS + size - 1}`);
      //26 metadata slots are reserved; lowerLimit = 26; upperLimit = 286 - 1 = 285
      const symbols: Symbols = {
        'a1/data/abc': getSymKey(lowerLimit),
        'a1/data/def': getSymKey(lowerLimit + 1),
      };
      // Second case : Existing key
      await redisStoreService.addSymbols(activityId, symbols);
      let savedSymbols: Symbols;
      [lowerLimit, upperLimit, savedSymbols] = await redisStoreService.reserveSymbolRange(activityId, size, 'ACTIVITY');
      expect(lowerLimit).toEqual(MDATA_SYMBOLS.SLOTS + MDATA_SYMBOLS.ACTIVITY.KEYS.length + 2); //lower limit starts at first usable slot
      expect(upperLimit).toEqual(size - 1); // [0 + ]286 - 1 = 285
      expect(Object.keys(savedSymbols).length).toEqual(MDATA_SYMBOLS.ACTIVITY.KEYS.length + 2); //total of meta/data keys
    });
  });
  
  describe('getSymbols', () => {
    it('should retrieve symbols for a given activity', async () => {
      const activityId = 'a2';
      const appId = 'app2';
      const symbols: Symbols = {
        'a2/data/ghi': 'baa',
        'a2/data/jkl': 'bab',
      };
      await redisStoreService.addSymbols(activityId, symbols);
      const result = await redisStoreService.getSymbols(activityId);
      expect(result).toEqual(symbols);
    });
  });
  
  describe('addSymbols', () => {
    it('should store symbols for a given activity', async () => {
      const activityId = 'a3';
      const appId = 'app3';
      const symbols: Symbols = {
        'a3/data/mno': 'caa',
        'a3/data/pqr': 'cab',
      };
      const result = await redisStoreService.addSymbols(activityId, symbols);
      expect(result).toEqual(true);
    });
  });

  describe('setState/getState', () => {
    it('sets and gets job/activity state', async () => {
      //1) add symbol sets for activity a1
      const jobId = 'jid';
      const topic = '$job.topic';
      const activityId = 'a1';
      const appId = appConfig.id;
      const size = 286;
      let [lowerLimit] = await redisStoreService.reserveSymbolRange(activityId, size, 'ACTIVITY');
      let symbols: Symbols = {
        'a1/output/data/some/field': getSymKey(lowerLimit),
        'a1/output/data/another/field': getSymKey(lowerLimit + 1),
      };
      await redisStoreService.addSymbols(activityId, symbols);

      //2) add symbol sets for the parent job/topic ($job.topic)
      [lowerLimit] = await redisStoreService.reserveSymbolRange(topic, size, 'JOB');
      symbols = {
        'data/name': getSymKey(lowerLimit),
        'data/age': getSymKey(lowerLimit + 1),
      };
      await redisStoreService.addSymbols(topic, symbols);

      //3) set job state
      const jobStatus = 1;
      const jobState: StringAnyType = {
        'a1/output/data/some/field': true,
        'a1/output/data/another/field': {'complex': 'object'},
        'a1/output/metadata/aid': activityId,
        'a1/output/metadata/atp': 'activity',
        'data/name': new Date(),
        'data/age': 55,
        'metadata/jid': jobId,
        'metadata/js': jobStatus,
      };
      const result = await redisStoreService.setState(jobState, jobStatus, jobId, appId, [activityId, topic]);
      expect(result).toEqual(jobId);
      
      //4) get job state
      const consumes: Consumes = {
        [activityId]: [
          'a1/output/data/some/field', 
          'a1/output/data/another/field',
          'a1/output/metadata/aid',
          'a1/output/metadata/atp',
        ],
        [topic]: [
          'data/name',
          'data/age',
          'metadata/jid',
        ]
      };
      const response = await redisStoreService.getState(jobId, appId, consumes);
      if (response) {
        const [resolvedJobState, resolvedJobStatus] = response;
        expect(resolvedJobState).toEqual(jobState);
        expect(resolvedJobStatus).toEqual(jobStatus);
      } else {
        fail('Job state/status not found');
      }
    });
  });

  describe('setStateNX', () => {
    it('should set the job data in the store with NX behavior', async () => {
      const jobId = 'job-1';
      const response = await redisStoreService.setStateNX(jobId, appConfig.id);
      expect(response).toEqual(true);
      const secondResponse = await redisStoreService.setStateNX(jobId, appConfig.id);
      expect(secondResponse).toEqual(false);
      const hashKey = redisStoreService.mintKey(KeyType.JOB_STATE, { appId: appConfig.id, jobId });
      const storedActivityId = await redisStoreService.redisClient.hget(hashKey, ':');
      expect(storedActivityId).toEqual('1');
    });
  });

  describe('setStats', () => {
    it('should set and get job stats correctly', async () => {
      const jobKey = 'job-key';
      const jobId = 'job-id';
      const dateTime = '202304170000';
      const stats: StatsType = {
        general: [{ metric: 'count', target: 'target1', value: 1 }],
        index: [{ metric: 'index', target: 'target2', value: 20 }],
        median: [{ metric: 'mdn', target: 'target3', value: 30 }],
      };

      const result = await redisStoreService.setStats(jobKey, jobId, dateTime, stats, appConfig);
      expect(result).not.toBeNull();

      const generalStatsKey = redisStoreService.mintKey(KeyType.JOB_STATS_GENERAL, { ...cacheConfig, jobId, jobKey, dateTime });
      const generalStats = await redisClient.hgetall(generalStatsKey);
      expect(generalStats[stats.general[0].target]).toEqual(stats.general[0].value.toString());
  
      const indexStatsKey = redisStoreService.mintKey(KeyType.JOB_STATS_INDEX, { ...cacheConfig, jobId, jobKey, dateTime, facet: stats.index[0].target });
      const indexStats = await redisClient.lrange(indexStatsKey, 0, -1);
      expect(indexStats[0]).toEqual(stats.index[0].value.toString());
  
      const medianStatsKey = redisStoreService.mintKey(KeyType.JOB_STATS_MEDIAN, { ...cacheConfig, jobId, jobKey, dateTime, facet: stats.median[0].target });
      const medianStats = await redisClient.zrange(medianStatsKey, 0, -1, 'WITHSCORES');
      expect(medianStats[1]).toEqual(stats.median[0].value.toString());

      //expect getStats to cast the value to a number, so it is an exact match even though a string in redis
      const jobStats = await redisStoreService.getJobStats([generalStatsKey]);
      expect(jobStats[generalStatsKey][stats.general[0].target]).toEqual(stats.general[0].value);
    });
  });

  describe('Time Triggers', () => {
    it('should register job activities for sleep/awake events', async () => {
      // Register jobs to be awakened/triggered
      const jobId1 = 'job-id-1';
      const jobId2 = 'job-id-2';
      const activityId = 'activity-id';
      const awakenTime = Date.now();
      const type = 'sleep';
      await redisStoreService.registerTimeHook(jobId1, activityId, type, awakenTime);
      await redisStoreService.registerTimeHook(jobId2, activityId, type, awakenTime);
      // Check that the jobs were added to the correct list
      const listKey = redisStoreService.mintKey(KeyType.TIME_RANGE, { appId: appConfig.id, timeValue: awakenTime });
      const jobList = await redisClient.lrange(listKey, 0, -1);
      expect(jobList?.[0]).toEqual(`${type}::${activityId}::${jobId1}`);
      expect(jobList?.[1]).toEqual(`${type}::${activityId}::${jobId2}`);
      // Retrieve the next job to be triggered (to receive a time event)
      const [nextListKey, nextJobId, nextActivityId] = (await redisStoreService.getNextTimeJob()) as [string, string, string];
      expect(nextListKey).toEqual(listKey);
      expect(nextJobId).toEqual(jobId1);
      expect(nextActivityId).toEqual(activityId);
      // Check that jobId1 was removed from the list
      const updatedJobList = await redisClient.lrange(listKey, 0, -1);
      expect(updatedJobList.length).toEqual(1);
      expect(updatedJobList[0]).toEqual(`${type}::${activityId}::${jobId2}`);
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
      expect(result).toEqual(2); //number of schemas
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
    it('should set and get the hook', async () => {
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
      expect(remainingValue).toEqual(hook.jobId);
    });
  });

  describe('deleteHookSignal', () => {
    it('should delete the hook', async () => {
      const hook: HookSignal = {
        topic: 'test-topic',
        resolved: 'test-resolved',
        jobId: 'test-job-id',
      };
      await redisStoreService.setHookSignal(hook);
      let retrievedSignal = await redisStoreService.getHookSignal(hook.topic, hook.resolved);
      expect(retrievedSignal).not.toBeNull();
      let deletedCount = await redisStoreService.deleteHookSignal(hook.topic, hook.resolved);
      expect(deletedCount).toEqual(1);
      retrievedSignal = await redisStoreService.getHookSignal(hook.topic, hook.resolved);
      expect(retrievedSignal).toBeUndefined();
      deletedCount = await redisStoreService.deleteHookSignal(hook.topic, hook.resolved);
      expect(deletedCount).toBeUndefined();
    });
  });
});