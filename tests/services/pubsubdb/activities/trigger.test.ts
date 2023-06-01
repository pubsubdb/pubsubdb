import {
  PubSubDB,
  IORedisStore,
  IORedisStream,
  IORedisSub } from '../../../../index';
import {
  ActivityType,
  ActivityData,
  ActivityMetadata } from '../../../../typedefs/activity';
import { Trigger } from '../../../../services/pubsubdb/activities/trigger';
import { RedisConnection } from '../../../$setup/cache/ioredis';

describe('Trigger class', () => {
  let pubSubDB: PubSubDB;
  let storeConnection: RedisConnection;
  let subscriberConnection: RedisConnection;
  let streamerConnection: RedisConnection;

  beforeAll(async () => {
    //get standard redis connections (3 used for this test)
    storeConnection = await RedisConnection.getConnection('test-connection');
    subscriberConnection = await RedisConnection.getConnection('test-subscriber');
    streamerConnection = await RedisConnection.getConnection('test-streamer');
    //init pubSubDB, with wrapped redis connection clients
    pubSubDB = await PubSubDB.init({
      appId: 'test-app',
      engine: {
        store: new IORedisStore(await storeConnection.getClient()),
        stream: new IORedisStream(await subscriberConnection.getClient()),
        sub: new IORedisSub(await streamerConnection.getClient()),
      }
    });
  });

  afterAll(async () => {
    await RedisConnection.disconnectAll();
  });

  it('should create a job with the correct metadata', async () => {
    const ActivityType: ActivityType = {
      title: 'Some title',
      type: 'trigger',
      subtype: 'test-subtype',
      stats: {
        id: 'job_id'
      }
    };
    const activityData: ActivityData = {
      input: {},
      output: {},
    };
    const activityMetadata: ActivityMetadata = {
      aid: 'a1',
      atp: 'trigger',
      stp: 'async',
      ac: '2021-01-01T00:00:00.000Z',
      au: '2021-01-01T00:00:00.000Z',
    };
    const activityHookData = null;

    const trigger = new Trigger(ActivityType, activityData, activityMetadata, activityHookData, pubSubDB);
    const createJobSpy = jest.spyOn(trigger, 'resolveJobId');
    trigger.resolveJobId(trigger.createInputContext());
    expect(createJobSpy).toHaveBeenCalledTimes(1);
  });
});
