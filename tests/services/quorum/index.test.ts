import { PSNS } from '../../../modules/key';
import { sleepFor } from '../../../modules/utils';
import {
  IORedisStore,
  IORedisStream,
  IORedisSub,
  PubSubDB,
  PubSubDBConfig } from '../../../index';
import { NumberHandler } from '../../../services/pipe/functions/number';
import { StreamSignaler } from '../../../services/signaler/stream';
import { RedisConnection } from '../../$setup/cache/ioredis';
import { RedisClientType } from '../../../typedefs/ioredisclient';
import {
  StreamData,
  StreamDataResponse,
  StreamStatus } from '../../../typedefs/stream';
import {
  PresenceMessage,
  QuorumMessage,
  RollCallMessage,
  ThrottleMessage } from '../../../typedefs/quorum';
import { QuorumService } from '../../../services/quorum';

describe('StreamSignaler', () => {
  const appConfig = { id: 'calc', version: '1' };
  //Redis connection ids (this test uses 4 separate Redis connections)
  const CONNECTION_KEY = 'manual-test-connection';
  const SUBSCRIPTION_KEY = 'manual-test-subscription';
  const STREAM_ENGINE_CONNECTION_KEY = 'manual-test-stream-engine-connection';
  const STREAM_WORKER_CONNECTION_KEY = 'manual-test-stream-worker-connection';
  //Redis connections (ioredis)
  let redisConnection: RedisConnection;
  let subscriberConnection: RedisConnection;
  let streamEngineConnection: RedisConnection;
  let streamWorkerConnection: RedisConnection;
  //Redis clients (ioredis)
  let redisStorer: RedisClientType;
  let redisSubscriber: RedisClientType;
  let redisEngineStreamer: RedisClientType;
  let redisWorkerStreamer: RedisClientType;
  //PubSubDB Redis client wrappers
  let redisStore: IORedisStore;
  let redisEngineStream: IORedisStream;
  let redisWorkerStream: IORedisStream;
  let redisSub: IORedisSub;
  //PubSubDB instance
  let pubSubDB: PubSubDB;

  beforeAll(async () => {
    //init Redis connections and clients
    redisConnection = await RedisConnection.getConnection(CONNECTION_KEY);
    subscriberConnection = await RedisConnection.getConnection(SUBSCRIPTION_KEY);
    streamEngineConnection = await RedisConnection.getConnection(STREAM_ENGINE_CONNECTION_KEY);
    streamWorkerConnection = await RedisConnection.getConnection(STREAM_WORKER_CONNECTION_KEY);
    redisStorer = await redisConnection.getClient();
    redisSubscriber = await subscriberConnection.getClient();
    redisEngineStreamer = await streamEngineConnection.getClient();
    redisWorkerStreamer = await streamWorkerConnection.getClient();
    redisStorer.flushdb();
    //wrap Redis clients in PubSubDB Redis client wrappers
    redisStore = new IORedisStore(redisStorer);
    redisEngineStream = new IORedisStream(redisEngineStreamer);
    redisWorkerStream = new IORedisStream(redisWorkerStreamer);
    redisSub = new IORedisSub(redisSubscriber);
    //init/activate PubSubDB (test both `engine` and `worker` roles)
    const config: PubSubDBConfig = {
      appId: appConfig.id,
      namespace: PSNS,
      engine: {
        store: redisStore,
        stream: redisEngineStream,
        sub: redisSub,
      },
      workers: [
        {
          topic: 'calculation.execute',
          store: redisStore,
          stream: redisWorkerStream,
          sub: redisSub,
          callback: async (streamData: StreamData): Promise<StreamDataResponse> => {
            const values = JSON.parse(streamData.data.values as string) as number[];
            const operation = streamData.data.operation as 'add'|'subtract'|'multiply'|'divide';
            const result = new NumberHandler()[operation](values);
            return {
              status: StreamStatus.SUCCESS,
              metadata: { ...streamData.metadata },
              data: { result },
            } as StreamDataResponse;
          }
        }
      ]
    };
    pubSubDB = await PubSubDB.init(config);
    await pubSubDB.deploy('/app/tests/$setup/apps/calc/v1/pubsubdb.yaml');
  });

  afterAll(async () => {
    await StreamSignaler.stopConsuming();
    await RedisConnection.disconnectAll();
  });

  describe('Setup', () => {
    it('activates a version', async () => {
      const isActivated = await pubSubDB.activate(appConfig.version);
      expect(isActivated).toBe(true);
    });
  });

  describe('Run', () => {
    it('should run synchronous calls in parallel', async () => {
      //this test should seed some audit data when rollcall is run
      const payload = {
        operation: 'divide',
        values: JSON.stringify([200, 4, 5]),
      };
      const [divide, b, c, d, multiply] = await Promise.all([
        pubSubDB.pubsub('calculate', payload),
        pubSubDB.pubsub('calculate', payload),
        pubSubDB.pubsub('calculate', payload),
        pubSubDB.pubsub('calculate', payload),
        pubSubDB.pubsub('calculate', {
          operation: 'multiply',
          values: JSON.stringify([10, 10, 10]),
        }),
      ]);
      expect(divide?.data.result).toBe(10);
      expect(multiply?.data.result).toBe(1000);
    });
  });

  describe('Pub Sub', () => {
    it('sends a `throttle` message targeting the engine (guid)', async () => {
      const callback = (topic: string, message: QuorumMessage) => {
        expect(['throttle', 'job'].includes(message.type)).toBeTruthy();
        expect((message as ThrottleMessage).guid).toBe(pubSubDB.quorum?.guid);
      };
      pubSubDB.quorum?.sub(callback);
      const throttleMessage: ThrottleMessage = {
        type: 'throttle',
        guid: pubSubDB.quorum?.guid,
        throttle: 1000,
      };
      await pubSubDB.quorum?.pub(throttleMessage);
      await sleepFor(1000);
      pubSubDB.quorum?.unsub(callback);
    });

    it('sends a `rollcall` message targeting an engine (guid)', async () => {
      const callback = (topic: string, message: QuorumMessage) => {
        //will see both messages (the call and response)
        expect(['presence', 'rollcall'].includes(message.type)).toBeTruthy();
        if (message.type === 'presence') {
          expect((message as PresenceMessage).profile?.d).not.toBeUndefined();
        } else {
          expect(message.type).toBe('rollcall');
          expect((message as RollCallMessage).guid).toBe(pubSubDB.quorum?.guid);
        }
      };
      pubSubDB.quorum?.sub(callback);
      const rollcallMessage: RollCallMessage = {
        type: 'rollcall',
        guid: pubSubDB.quorum?.guid,
      };
      await pubSubDB.quorum?.pub(rollcallMessage);
      await sleepFor(1000);
      pubSubDB.quorum?.unsub(callback);
    });

    it('request quorum', async () => {
      (pubSubDB.quorum as QuorumService).quorum = 0;
      await pubSubDB.quorum?.requestQuorum(1000);
      expect(pubSubDB.quorum?.quorum).toBe(1);
    });
  });
});
