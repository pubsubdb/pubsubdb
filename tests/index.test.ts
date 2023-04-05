import { PubSubDB, PubSubDBConfig, RedisJSONStore } from '../index';
import { RedisConnection, RedisClientType } from '../cache/redis';

describe('index', () => {
  const CONNECTION_KEY = 'manual-test-connection';
  let pubSubDB: PubSubDB;
  let redisConnection: RedisConnection;
  let redisClient: RedisClientType;
  let redisJSONStore: RedisJSONStore;

  beforeAll(async () => {
    redisConnection = await RedisConnection.getConnection(CONNECTION_KEY);
    redisClient = await redisConnection.getClient();
    redisClient.flushDb();
    redisJSONStore = new RedisJSONStore(redisClient);
  });

  afterAll(async () => {
    await RedisConnection.disconnectAll();
  });

  it('should initialize pubsubdb', async () => {
    const config: PubSubDBConfig = {
      store: redisJSONStore
    };
    pubSubDB = await PubSubDB.init(config);
  });

  it('should should publish a message', async () => {
    //add schema to db to instance the trigger
    pubSubDB.getStore().setSchema('trigger.test.requested', { type: 'trigger' });
    //publish a message that will trigger the trigger
    pubSubDB.pub('trigger.test.requested', { val: 'test message' });
  });
});
