import { Trigger } from "../../../../services/pubsubdb/activities/trigger";
import { RedisConnection } from '../../../$setup/cache/ioredis';
import { ActivityType, ActivityData, ActivityMetadata } from "../../../../typedefs/activity";
import { PubSubDB, IORedisStore } from '../../../../index';

describe("Trigger class", () => {
  let pubSubDB: PubSubDB;
  let redisConnection: RedisConnection;
  let subscriberConnection: RedisConnection;
  let streamerConnection: RedisConnection;

  beforeAll(async () => {
    redisConnection = await RedisConnection.getConnection('test-connection');
    subscriberConnection = await RedisConnection.getConnection('test-subscriber');
    streamerConnection = await RedisConnection.getConnection('test-streamer');
    const redisClient = await redisConnection.getClient();
    const redisSubscriber = await subscriberConnection.getClient();
    const redisStreamer = await streamerConnection.getClient();
    const redisStore = new IORedisStore(redisClient, redisSubscriber, redisStreamer);
    pubSubDB = await PubSubDB.init({ store: redisStore, appId: 'test-app' });
  });

  afterAll(async () => {
    await RedisConnection.disconnectAll();
  });

  it("should create a job with the correct metadata", async () => {
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
      aid: "a1",
      atp: "trigger",
      stp: "async",
      ac: "2021-01-01T00:00:00.000Z",
      au: "2021-01-01T00:00:00.000Z",
    };
    const activityHookData = null;

    const trigger = new Trigger(ActivityType, activityData, activityMetadata, activityHookData, pubSubDB);
    const createJobSpy = jest.spyOn(trigger, 'resolveJobId');
    trigger.resolveJobId(trigger.createInputContext());
    expect(createJobSpy).toHaveBeenCalledTimes(1);
  });
});
