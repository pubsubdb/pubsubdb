import { IORedisStore, PubSubDB, PubSubDBConfig } from '../../../index';
import { SignalerService } from '../../../services/signaler';
import { RedisConnection } from '../../$setup/cache/ioredis';
import { PSNS } from '../../../services/store/key';
import { RedisClientType } from '../../../typedefs/ioredis';
import { StreamData, StreamDataResponse, StreamStatus } from '../../../typedefs/stream';
import { NumberHandler } from '../../../services/pipe/functions/number';

describe('SignalerService', () => {
  //two different apps will be tested; the 'id' aligns with the id in the YAML config
  const appConfig = { id: 'test-app', version: '1' };
  const appConfig2 = { id: 'calc', version: '1' };
  const streamName = 'testStream';
  const groupName = 'testGroup';
  const consumerName = 'testConsumer';
  //ALL published messages sent via XSTREAM must implement `StreamData` interface
  const message: StreamData = {
    metadata: {
      jid: 'test-jid',
      aid: 'test-aid',
      topic: streamName,
    },
    data: {
      id: '1',
      data: 'Test data',
      price: 5.55,
    },
  };
  const CONNECTION_KEY = 'manual-test-connection';
  const SUBSCRIPTION_KEY = 'manual-test-subscription';
  const STREAM_CONNECTION_KEY = 'manual-test-stream-connection';
  let signalerService: SignalerService;
  let redisConnection: RedisConnection;
  let subscriberConnection: RedisConnection;
  let streamConnection: RedisConnection;
  let redisClient: RedisClientType;
  let redisSubscriber: RedisClientType;
  let redisStreamer: RedisClientType;
  let redisStore: IORedisStore;
  let redisStore2: IORedisStore;
  let pubSubDB: PubSubDB;
  let pubSubDB2: PubSubDB;

  beforeAll(async () => {
    redisConnection = await RedisConnection.getConnection(CONNECTION_KEY);
    subscriberConnection = await RedisConnection.getConnection(SUBSCRIPTION_KEY);
    streamConnection = await RedisConnection.getConnection(STREAM_CONNECTION_KEY);
    redisClient = await redisConnection.getClient();
    redisSubscriber = await subscriberConnection.getClient();
    redisStreamer = await streamConnection.getClient();
    redisClient.flushdb();
    redisStore = new IORedisStore(redisClient, redisSubscriber, redisStreamer);

    const config: PubSubDBConfig = {
      appId: appConfig.id,
      namespace: PSNS,
      store: redisStore,
      adapters: [
        {
          topic: 'order.bundle',
          callback: async (streamData: StreamData) => {
            const streamDataResponse: StreamDataResponse = {
              status: StreamStatus.SUCCESS,
              metadata: { ...streamData.metadata },
              data: { some: 'string', is: true, number: 1 },
            }
            return streamDataResponse;
          }
        }
      ]
    };
    pubSubDB = await PubSubDB.init(config);
    await pubSubDB.deploy('/app/tests/$setup/seeds/pubsubdb.yaml');
    await pubSubDB.activate(appConfig.version);
    expect(pubSubDB.store).not.toBeNull();
    signalerService = pubSubDB.signaler as SignalerService;
    pubSubDB.store = pubSubDB.store as IORedisStore;

    //add a second pubsubdb app ('calc')
    //note: ok to re-use clients; but the store must be new
    redisStore2 = new IORedisStore(redisClient, redisSubscriber, redisStreamer);
    const config2: PubSubDBConfig = {
      appId: appConfig2.id,
      namespace: PSNS,
      store: redisStore2,
      adapters: [
        {
          topic: 'calculation.execute',
          callback: async (streamData: StreamData) => {
            const values = JSON.parse(streamData.data.values as string) as number[];
            const operation = streamData.data.operation as 'add'|'subtract'|'multiply'|'divide';
            const result = new NumberHandler()[operation](values);
            const streamDataResponse: StreamDataResponse = {
              status: StreamStatus.SUCCESS,
              metadata: { ...streamData.metadata },
              data: { result },
            }
            return streamDataResponse;
          }
        }
      ]
    };
    pubSubDB2 = await PubSubDB.init(config2);
    await pubSubDB.deploy('/app/tests/$setup/apps/calc/v1/pubsubdb.yaml');
    await pubSubDB.activate(appConfig2.version);
  });

  afterAll(async () => {
    await RedisConnection.disconnectAll();
    //todo: cleanup signalerService connections;
    //      use a weakmap to track connections
  });

  beforeEach(() => {
    //perhaps some cleaup
  });

  describe('Execute unit of work', () => {
    it('should invoke a flow with an exec activity in app 1', async () => {
      const payload = {
        id: `ord_unitofwork123`,
        size: 'lg',
        primacy: 'primary',
        color: 'red',
        send_date: new Date().toISOString(),
        must_release_series: '202304120000',
        actual_release_series: '202304110000',
        facility: 'acme',
      };
      const jobId = await pubSubDB.pub('order.finalize', payload);
      await new Promise(resolve => setTimeout(resolve, 1500));
      expect(jobId).not.toBeNull();
    });

    it('should invoke an exec activity (add) in calculator app', async () => {
      const payload = {
        operation: 'add',
        values: JSON.stringify([1, 2, 3, 4, 5]),
      };
      const jobId = await pubSubDB2.pub('calculate', payload);
      await new Promise(resolve => setTimeout(resolve, 1500));
      expect(jobId).not.toBeNull();
      const jobResponse = await pubSubDB2.get(jobId);
      expect(jobResponse?.result).toBe(15);
    });

    it('should invoke an exec activity (subtract) in calculator app', async () => {
      const payload = {
        operation: 'subtract',
        values: JSON.stringify([5, 4, 3, 2, 1]),
      };
      const jobId = await pubSubDB2.pub('calculate', payload);
      await new Promise(resolve => setTimeout(resolve, 1500));
      expect(jobId).not.toBeNull();
      const jobResponse = await pubSubDB2.get(jobId);
      expect(jobResponse?.result).toBe(-5);
    });

    it('should invoke an exec activity (multiply) in calculator app', async () => {
      const payload = {
        operation: 'multiply',
        values: JSON.stringify([5, 4, 3, 2, 1]),
      };
      const jobId = await pubSubDB2.pub('calculate', payload);
      await new Promise(resolve => setTimeout(resolve, 1500));
      expect(jobId).not.toBeNull();
      const jobResponse = await pubSubDB2.get(jobId);
      expect(jobResponse?.result).toBe(120);
    });

    it('should invoke an exec activity (divide) in calculator app', async () => {
      const payload = {
        operation: 'divide',
        values: JSON.stringify([100, 4, 5]),
      };
      const jobId = await pubSubDB2.pub('calculate', payload);
      await new Promise(resolve => setTimeout(resolve, 1000));
      expect(jobId).not.toBeNull();
      const jobResponse = await pubSubDB2.get(jobId);
      expect(jobResponse?.result).toBe(5);
    });
  });

  //todo: add `xinfo` to store
  // describe('createGroup', () => {
  //   it('creates a new group', async () => {
  //     await signalerService.createGroup(streamName, groupName);
  //     const groups = await pubSubDB.store.xinfo('GROUPS', streamName);
  //     const groupNames = groups.map(group => group.name);
  //     expect(groupNames).toContain(groupName);
  //   });
  // });

  //todo: add `xranged` to store
  // describe('publishMessage', () => {
  //   it('publishes a message to the stream', async () => {
  //     await signalerService.publishMessage(streamName, message);
  //     const messages = await pubSubDB.store.xrange(streamName, '-', '+');
  //     const messageData = messages.map(message => JSON.parse(message[1][1]));
  //     expect(messageData).toContainEqual(message);
  //   });
  // });

  describe('consumeMessages', () => {
    it('consumes messages from a stream and processes them', async () => {
      await signalerService.createGroup(streamName, groupName);
      await signalerService.publishMessage(streamName, message);
      let processedMessage: StreamData | null = null;
      const callback = async (streamData: StreamData) => {
        processedMessage = streamData;
      };
      signalerService.consumeMessages(streamName, groupName, consumerName, callback);
      await new Promise(resolve => setTimeout(resolve, 1500));
      expect(processedMessage).toEqual(message);
      signalerService.stopConsuming();
    });
  });
  
  describe('stopConsuming', () => {
    it('stops consuming messages', async () => {  
      await signalerService.createGroup(streamName, groupName);
      await signalerService.publishMessage(streamName, message);
      const callback = jest.fn();
      const consumePromise = signalerService.consumeMessages(streamName, groupName, consumerName, callback);
      signalerService.stopConsuming();
      await consumePromise;
      expect(callback).not.toHaveBeenCalled();
    });
  });
  
  //todo: reclaim logic for failed workers/adapters
  // describe('claimUnacknowledgedMessages', () => {
  //   it('claims unacknowledged messages', async () => {
  //     const newConsumerName = 'newTestConsumer';
  //     const idleTimeMs = 500;
  //     await signalerService.createGroup(streamName, groupName);
  //     await signalerService.publishMessage(streamName, message);
  //     await pubSubDB.store?.xreadgroup('GROUP', groupName, consumerName, 'BLOCK', 1, 'STREAMS', streamName, '>');
  //     await signalerService.claimUnacknowledgedMessages(streamName, groupName, newConsumerName, idleTimeMs);
  //     const pendingMessages = await pubSubDB.store?.xpending(streamName, groupName, '-', '+', 10, newConsumerName);
  //     expect(pendingMessages).toHaveLength(1);
  //   });
  // });
});
