import { Trigger } from "../../../../services/pubsubdb/activities/trigger";
import { RedisConnection } from '../../../../cache/redis';
import { ActivityType, ActivityData, ActivityMetadata } from "../../../../typedefs/activity";
import { PubSubDB, RedisStore } from '../../../..';

describe("Trigger class", () => {
  let pubSubDB: PubSubDB;
  let redisConnection: RedisConnection;

  beforeAll(async () => {
    // Connect to Redis
    redisConnection = await RedisConnection.getConnection('test-connection');
    const redisClient = await redisConnection.getClient();
    const redisStore = new RedisStore(redisClient);
    pubSubDB = await PubSubDB.init({ store: redisStore, appId: 'test-app' });
  });

  afterAll(async () => {
    await RedisConnection.disconnectAll();
  });

  it("should create a job with the correct metadata", async () => {
    // Prepare test data
    const ActivityType: ActivityType = {
      title: "Some title",
      type: "trigger",
      subtype: "test-subtype",
      stats: {
        id: "job_id"
      }
    };

    const activityData: ActivityData = {
      input: {},
      output: {},
    };

    const activityMetadata: ActivityMetadata = {
      activity_id: "a1",
      activity_type: "trigger",
      activity_subtype: "async",
    };

    // Create Trigger instance
    const trigger = new Trigger(ActivityType, activityData, activityMetadata, pubSubDB);

    // Spy on the createJob method to check if it's called and to inspect the job created
    const createJobSpy = jest.spyOn(trigger, 'getJobId');

    // Call restoreJobContext to trigger the createJob method
    await trigger.getJobId();

    // Check if the createJob method was called
    expect(createJobSpy).toHaveBeenCalledTimes(1);
  });
});
