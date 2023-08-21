import { KeyType, PSNS } from '../../../../modules/key';
import { LoggerService } from '../../../../services/logger';
import { RedisStoreService } from '../../../../services/store/clients/redis';
import { RedisSubService } from '../../../../services/sub/clients/redis';
import { SubscriptionCallback } from '../../../../types/quorum';
import { RedisConnection, RedisClientType } from '../../../$setup/cache/redis';

describe('FUNCTIONAL | RedisSubService', () => {
  const appConfig = { id: 'test-app', version: '1' };
  const engineId = '9876543210';
  let redisConnection: RedisConnection;
  let redisPublisherConnection: RedisConnection;
  let redisClient: RedisClientType;
  let redisPublisherClient: RedisClientType;
  let redisSubService: RedisSubService;
  let redisPubService: RedisStoreService;

  beforeEach(async () => {
    redisSubService = new RedisSubService(redisClient);
  });

  beforeAll(async () => {
    redisConnection = await RedisConnection.getConnection('test-connection-1');
    redisPublisherConnection = await RedisConnection.getConnection('test-publisher-1');
    redisClient = await redisConnection.getClient();
    redisPublisherClient = await redisPublisherConnection.getClient();
    await redisPublisherClient.flushDb();
    redisPubService = new RedisStoreService(redisPublisherClient);
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
