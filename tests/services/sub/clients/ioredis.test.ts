import { KeyType, PSNS } from '../../../../modules/key';
import { LoggerService } from '../../../../services/logger';
import { IORedisStoreService } from '../../../../services/store/clients/ioredis';
import { IORedisSubService } from '../../../../services/sub/clients/ioredis';
import { SubscriptionCallback } from '../../../../typedefs/quorum';
import { RedisConnection, RedisClientType } from '../../../$setup/cache/ioredis';

describe('IORedisSubService', () => {
  const appConfig = { id: 'test-app', version: '1' };
  const engineId = '9876543210';
  let redisConnection: RedisConnection;
  let redisPublisherConnection: RedisConnection;
  let redisClient: RedisClientType;
  let redisPublisherClient: RedisClientType;
  let redisSubService: IORedisSubService;
  let redisPubService: IORedisStoreService;

  beforeEach(async () => {
    redisSubService = new IORedisSubService(redisClient);
  });

  beforeAll(async () => {
    redisConnection = await RedisConnection.getConnection('test-connection-1');
    redisPublisherConnection = await RedisConnection.getConnection('test-publisher-1');
    redisClient = await redisConnection.getClient();
    redisPublisherClient = await redisPublisherConnection.getClient();
    await redisPublisherClient.flushdb();
    redisPubService = new IORedisStoreService(redisPublisherClient);
    await redisPubService.init(PSNS, appConfig.id, new LoggerService());
  });

  afterAll(async () => {
    await RedisConnection.disconnectAll();
  });

  describe('init', () => {
    it('subscribes during initialization', async () => {
      const subscriptionHandler: SubscriptionCallback = (topic, message) => {
        const topicKey = redisSubService.mintKey(KeyType.QUORUM, { appId: appConfig.id });
        expect(topic).toEqual(topicKey);
        expect(message).toEqual(payload);
      };
      await redisSubService.init(PSNS, appConfig.id, engineId, new LoggerService());
      const payload = { 'any': 'data' };
      await redisSubService.subscribe(KeyType.QUORUM, subscriptionHandler, appConfig.id);
      await redisPubService.publish(KeyType.QUORUM, payload, appConfig.id);
    });
  });

  describe('subscribe', () => {
    it('unsubscribes and subscribes', async () => {
      const subscriptionHandler: SubscriptionCallback = (topic, message) => {
        const topicKey = redisSubService.mintKey(KeyType.QUORUM, { appId: appConfig.id });
        expect(topic).toEqual(topicKey);
        expect(message).toEqual(payload);
      };
      await redisSubService.init(PSNS, appConfig.id, engineId, new LoggerService());
      const payload = { 'any': 'data' };
      await redisSubService.subscribe(KeyType.QUORUM, subscriptionHandler, appConfig.id);
      const pub = await redisPubService.publish(KeyType.QUORUM, payload, appConfig.id);
      expect(pub).toBeTruthy();
    });
  });
});
