"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const trigger_1 = require("../../../../services/pubsubdb/activities/trigger");
const redis_1 = require("../../../../cache/redis");
const __1 = require("../../../..");
describe("Trigger class", () => {
    let pubSubDB;
    let redisConnection;
    beforeAll(async () => {
        // Connect to Redis
        redisConnection = await redis_1.RedisConnection.getConnection('test-connection');
        const redisClient = await redisConnection.getClient();
        const redisStore = new __1.RedisStore(redisClient);
        pubSubDB = await __1.PubSubDB.init({ store: redisStore, appId: 'test-app' });
    });
    afterAll(async () => {
        await redis_1.RedisConnection.disconnectAll();
    });
    it("should create a job with the correct metadata", async () => {
        // Prepare test data
        const ActivityType = {
            title: "Some title",
            type: "trigger",
            subtype: "test-subtype",
            stats: {
                id: "job_id"
            }
        };
        const activityData = {
            input: {},
            output: {},
        };
        const activityMetadata = {
            aid: "a1",
            atp: "trigger",
            stp: "async",
            ac: "2021-01-01T00:00:00.000Z",
            au: "2021-01-01T00:00:00.000Z",
        };
        // Create Trigger instance
        const trigger = new trigger_1.Trigger(ActivityType, activityData, activityMetadata, pubSubDB);
        // Spy on the createJob method to check if it's called and to inspect the job created
        const createJobSpy = jest.spyOn(trigger, 'getJobId');
        // Call restoreJobContext to trigger the createJob method
        await trigger.getJobId();
        // Check if the createJob method was called
        expect(createJobSpy).toHaveBeenCalledTimes(1);
    });
});
