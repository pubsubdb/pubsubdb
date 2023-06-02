import { PSNS } from '../../../../modules/key';
import { LoggerService } from '../../../../services/logger';
import { IORedisStreamService } from '../../../../services/stream/clients/ioredis';
import { RedisConnection, RedisClientType } from '../../../$setup/cache/ioredis';

describe('IORedisStreamService', () => {
  let redisConnection: RedisConnection;
  let redisClient: RedisClientType;
  let redisStreamService: IORedisStreamService;

  beforeEach(async () => {
    await redisClient.flushdb();
    redisStreamService = new IORedisStreamService(redisClient);
    const appConfig = { id: 'APP_ID', version: 'APP_VERSION' };
    await redisStreamService.init(PSNS, appConfig.id, new LoggerService());
  });

  beforeAll(async () => {
    redisConnection = await RedisConnection.getConnection('test-connection-1');
    redisClient = await redisConnection.getClient();
  });

  afterAll(async () => {
    await RedisConnection.disconnectAll();
  });

  describe('xgroup', () => {
    it('should create a consumer group', async () => {
      const key = 'testKey';
      const groupName = 'testGroup';
      const groupId = '0';
      const created = await redisStreamService.xgroup('CREATE', key, groupName, groupId, 'MKSTREAM');
      expect(created).toBe(true);
      const groupInfo = await redisClient.xinfo('GROUPS', key);
      expect(Array.isArray(groupInfo)).toBe(true);
      const createdGroup = (groupInfo as ['name', string][]).find(([,name]) => name === groupName);
      expect(createdGroup).toBeDefined();
    });
  });
  
  describe('xadd', () => {
    it('should add data to stream', async () => {
      const key = 'testKey';
      const msgId = '*';
      const field = 'testField';
      const value = 'testValue';
      await redisStreamService.xadd(key, msgId, field, value);
      const messages = await redisClient.xrange(key, '-', '+');
      const addedMessage = messages.find(([messageId, fields]) => fields.includes(field) && fields.includes(value));
      expect(addedMessage).toBeDefined();
    });
  });
  
  describe('xreadgroup', () => {
    it('should read data from group in a stream', async () => {
      const key = 'testKey';
      const groupName = 'testGroup';
      const consumerName = 'testConsumer';
      const groupId = '0';
      const msgId = '*';
      const field = 'testField';
      const value = 'testValue';
      await redisStreamService.xgroup('CREATE', key, groupName, groupId, 'MKSTREAM');
      const messageId = await redisStreamService.xadd(key, msgId, field, value);
      const messages = await redisStreamService.xreadgroup(
        'GROUP',
        groupName,
        consumerName,
        'BLOCK',
        '1000',
        'STREAMS',
        key,
        '>'
      );
      const readMessage = (messages as string[][][])[0][1].find(([readMessageId, fields]) => readMessageId === messageId);
      expect(readMessage).toBeDefined();
    });
  });

  describe('xack', () => {
    it('should acknowledge message in a group', async () => {
      const key = 'testKey';
      const groupName = 'testGroup';
      const groupId = '0';
      const msgId = '*';
      const field = 'testField';
      const value = 'testValue';
      await redisStreamService.xgroup('CREATE', key, groupName, groupId, 'MKSTREAM');
      const messageId = await redisStreamService.xadd(key, msgId, field, value);
      await redisStreamService.xreadgroup('GROUP', groupName, 'testConsumer', 'BLOCK', '1000', 'STREAMS', key, '>');
      const ackCount = await redisStreamService.xack(key, groupName, messageId);
      expect(ackCount).toBe(1);
    });
  });

  describe('xpending', () => {
    it('should retrieve pending messages for a group', async () => {
      const key = 'testKey';
      const consumerName = 'testConsumer';
      const groupName = 'testGroup';
      const groupId = '0';
      const msgId = '*';
      const field = 'testField';
      const value = 'testValue';
      await redisStreamService.xgroup('CREATE', key, groupName, groupId, 'MKSTREAM');
      const messageId = await redisStreamService.xadd(key, msgId, field, value);
      await redisStreamService.xreadgroup('GROUP', groupName, consumerName, 'BLOCK', '1000', 'STREAMS', key, '>');
      const pendingMessages = await redisStreamService.xpending(key, groupName, '-', '+', 1, consumerName) as [string][];
      const isPending = pendingMessages.some(([id, , , ]) => id === messageId);
      expect(isPending).toBe(true);
    });
  });
  
  describe('xclaim', () => {
    it('should claim a pending message in a group', async () => {
      const key = 'testKey';
      const initialConsumer = 'testConsumer1';
      const claimantConsumer = 'testConsumer2';
      const groupName = 'testGroup';
      const groupId = '0';
      const msgId = '*';
      const field = 'testField';
      const value = 'testValue';
      // First, create a group and add a message to the stream
      await redisStreamService.xgroup('CREATE', key, groupName, groupId, 'MKSTREAM');
      const messageId = await redisStreamService.xadd(key, msgId, field, value);
      // Then, read the message from the group
      await redisStreamService.xreadgroup('GROUP', groupName, initialConsumer, 'BLOCK', '1000', 'STREAMS', key, '>');
      // Retrieve pending messages for the initial consumer
      let pendingMessages = await redisStreamService.xpending(key, groupName, '-', '+', 1, initialConsumer) as [string, string, number, any][];
      let claimedMessage = pendingMessages.find(([id,consumer, ,]) => id === messageId && consumer === initialConsumer);
      expect(claimedMessage).toBeDefined();
      // Claim the message by another consumer
      await redisStreamService.xclaim(key, groupName, claimantConsumer, 0, messageId);
      // Retrieve pending messages for the claimant consumer
      pendingMessages = await redisStreamService.xpending(key, groupName, '-', '+', 1, claimantConsumer) as [string, string, number, any][];
      claimedMessage = pendingMessages.find(([id,consumer, ,]) => id === messageId && consumer === claimantConsumer);
      expect(claimedMessage).toBeDefined();
    });
  });

  describe('xdel', () => {
    it('should delete a message from a stream', async () => {
      const key = 'testKey';
      const groupName = 'testGroup';
      const groupId = '0';
      const msgId = '*';
      const field = 'testField';
      const value = 'testValue';
      await redisStreamService.xgroup('CREATE', key, groupName, groupId, 'MKSTREAM');
      const messageId = await redisStreamService.xadd(key, msgId, field, value);
      const delCount = await redisStreamService.xdel(key, messageId);
      expect(delCount).toBe(1);
      const messages = await redisStreamService.xreadgroup('GROUP', groupName, 'testConsumer', 'BLOCK', '1000', 'STREAMS', key, messageId);
      const deletedMessage = (messages as string[][][])[0][1].find(([readMessageId, fields]) => readMessageId === messageId);
      expect(deletedMessage).toBeUndefined();
    });
  });
});