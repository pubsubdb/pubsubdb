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
import { RedisClientType } from '../../../types/ioredisclient';
import {
  StreamData,
  StreamDataResponse,
  StreamStatus } from '../../../types/stream';

describe('MapperService', () => {
  const appConfig = { id: 'tree' };
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
      logLevel: 'debug',
      engine: {
        store: redisStore,
        stream: redisEngineStream,
        sub: redisSub,
      },
      workers: [
        {
          //worker activities in the YAML files declare 'summer' as their subtype
          topic: 'summer',

          store: redisStore,
          stream: redisWorkerStream,
          sub: redisSub,

          callback: async (streamData: StreamData): Promise<StreamDataResponse> => {
            return {
              code: 200,
              status: StreamStatus.SUCCESS,
              metadata: { ...streamData.metadata },
              data: { result:  new Date().toLocaleString('en-US')},
            } as StreamDataResponse;
          }
        }
      ]
    };
    pubSubDB = await PubSubDB.init(config);
  });

  afterAll(async () => {
    await StreamSignaler.stopConsuming();
    await RedisConnection.disconnectAll();
  });

  describe('Deploy and Activate', () => {
    it('deploys and activates version 1', async () => {
      await pubSubDB.deploy('/app/tests/$setup/apps/tree/v1/pubsubdb.yaml');
      const isActivated = await pubSubDB.activate('1');
      expect(isActivated).toBe(true);
    });
  });

  describe('Run Version', () => {
    it('should run and map activities in parallel', async () => {
      const payload = { seed: 2, speed: 3 };
      const result = await pubSubDB.pubsub('spring', payload, 1500);
      const data = result?.data as {
        seed: number;
        speed: number;
        height: number;
      };
      expect(data.seed).toBe(payload.seed);
      expect(data.speed).toBe(payload.speed);
      expect(data.height).toBe(payload.seed * payload.speed);
    }, 2_000);
  });

  describe('Deploy and Activate', () => {
    it('deploys and activates version 2', async () => {
      await pubSubDB.deploy('/app/tests/$setup/apps/tree/v2/pubsubdb.yaml');
      const isActivated = await pubSubDB.activate('2');
      expect(isActivated).toBe(true);
    });
  });

  describe('Run Version', () => {
    it('should run and map activities in sequence', async () => {
      const payload = { seed: 5, speed: 7 };
      const result = await pubSubDB.pubsub('spring', payload, 2_000);
      const data = result?.data as {
        seed: number;
        speed: number;
        height: number;
      };
      expect(data.seed).toBe(payload.seed);
      expect(data.speed).toBe(payload.speed);
      expect(data.height).toBe(payload.seed * payload.speed);
    }, 2_500);
  });

  describe('Deploy and Activate', () => {
    it('deploys and activates version 3', async () => {
      await pubSubDB.deploy('/app/tests/$setup/apps/tree/v3/pubsubdb.yaml');
      const isActivated = await pubSubDB.activate('3');
      expect(isActivated).toBe(true);
    });
  });

  describe('Run Version', () => {
    it('should run and map activities in parallel and sequence', async () => {
      const payload = { seed: 4, speed: 9 };
      const result = await pubSubDB.pubsub('spring', payload, 2_000);
      const data = result?.data as {
        seed: number;
        speed: number;
        height: number;
      };
      expect(data.seed).toBe(payload.seed);
      expect(data.speed).toBe(payload.speed);
      expect(data.height).toBe(payload.seed * payload.speed);
    }, 2_500);
  });

  describe('Deploy and Activate', () => {
    it('deploys and activates version 4', async () => {
      await pubSubDB.deploy('/app/tests/$setup/apps/tree/v4/pubsubdb.yaml');
      const isActivated = await pubSubDB.activate('4');
      expect(isActivated).toBe(true);
    });
  });

  describe('Run Version', () => {
    it('should run one activity with multiple maps', async () => {
      const payload = { seed: 5, speed: 2 };
      const result = await pubSubDB.pubsub('spring', payload, 2_000);
      const data = result?.data as {
        seed: number;
        speed: number;
        height: number;
      };
      expect(data.seed).toBe(payload.seed);
      expect(data.speed).toBe(payload.speed);
      expect(data.height).toBe(payload.seed * payload.speed);
    }, 2_500);
  });

  describe('Deploy and Activate', () => {
    it('deploys and activates version 5', async () => {
      await pubSubDB.deploy('/app/tests/$setup/apps/tree/v5/pubsubdb.yaml');
      const isActivated = await pubSubDB.activate('5');
      expect(isActivated).toBe(true);
    });
  });

  describe('Run Version', () => {
    it('should run and map worker activities in parallel', async () => {
      const payload = { seed: 55, speed: 20 };
      const result = await pubSubDB.pubsub('spring', payload, 2_000);
      const data = result?.data as {
        seed: number;
        speed: number;
        height: number;
      };
      expect(data.seed).toBe(payload.seed);
      expect(data.speed).toBe(payload.speed);
      expect(data.height).toBe(payload.seed * payload.speed);
    }, 2_500);
  });
});
