"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const redis_1 = require("../../../cache/redis");
const keyStore_1 = require("../../../services/store/keyStore");
const redis_2 = require("../../../services/store/redis");
describe('RedisStoreService', () => {
    const appConfig = { id: 'test-app', version: '1' };
    const cacheConfig = { appId: 'test-app', appVersion: '1' };
    let redisConnection;
    let redisClient;
    let redisStoreService;
    beforeEach(async () => {
        await redisClient.flushDb();
        redisStoreService = new redis_2.RedisStoreService(redisClient);
        const appConfig = { id: 'APP_ID', version: 'APP_VERSION' };
        await redisStoreService.init(keyStore_1.PSNS, appConfig.id);
    });
    beforeAll(async () => {
        redisConnection = await redis_1.RedisConnection.getConnection('test-connection-1');
        redisClient = await redisConnection.getClient();
    });
    afterAll(async () => {
        await redis_1.RedisConnection.disconnectAll();
    });
    describe('mintKey', () => {
        it('should mint the key to access pubsubdb global settings', () => {
            const result = redisStoreService.mintKey(keyStore_1.KeyType.PUBSUBDB, {});
            //global settings are stored using the namespace and nothing else
            expect(result).toEqual(keyStore_1.PSNS);
        });
        it('should mint the key to access pubsubdb apps', () => {
            const result = redisStoreService.mintKey(keyStore_1.KeyType.APP, cacheConfig);
            expect(result).toEqual(`${keyStore_1.PSNS}:a:${cacheConfig.appId}`);
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
            expect(result).toEqual(2);
        });
    });
});
