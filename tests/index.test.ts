import { PubSubDB, PubSubDBConfig, RedisStore } from '../index';
import { RedisConnection, RedisClientType } from '../cache/redis';
import { PSNS } from '../services/store/keyStore';

describe('pubsubdb', () => {
  const appConfig = { id: 'test-app', version: '1' };
  const CONNECTION_KEY = 'manual-test-connection';
  let pubSubDB: PubSubDB;
  let redisConnection: RedisConnection;
  let redisClient: RedisClientType;
  let redisStore: RedisStore;

  beforeAll(async () => {
    redisConnection = await RedisConnection.getConnection(CONNECTION_KEY);
    redisClient = await redisConnection.getClient();
    redisClient.flushDb();
    redisStore = new RedisStore(redisClient);
  });

  afterAll(async () => {
    await RedisConnection.disconnectAll();
  });

  describe('init()', () => {
    it('should initialize PubSubDB', async () => {
      const config: PubSubDBConfig = {
        appId: appConfig.id,
        namespace: PSNS,
        store: redisStore
      };
      pubSubDB = await PubSubDB.init(config);
    });
  });

  describe('plan()', () => {
    it('should plan an app version deployment using a source path', async () => {
      await pubSubDB.plan('/app/seeds/pubsubdb.yaml');
    });
  });

  describe('deploy()', () => {
    it('should deploy an app version using a source path', async () => {
      await pubSubDB.deploy('/app/seeds/pubsubdb.yaml');
    });
  });

  describe('activate()', () => {
    it('should activate a deployed app version', async () => {
      await pubSubDB.activate(appConfig.version);
    });
  });

  describe('pub()', () => {
    it('should should publish a message', async () => {
      let payload: any;
      for (let i = 0; i < 10; i++) {
        payload = { 
          id: `ord_${parseInt((Math.random()*1000000).toString()).toString()}`, 
          price: 49.99 + i, 
          object_type: i % 2 ? 'widget' : 'order'
        }
        await pubSubDB.pub('order.approval.price.requested', payload);
      }
    });
  });
});
