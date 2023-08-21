import {
  IORedisStore,
  IORedisStream,
  IORedisSub,
  PubSubDB,
  PubSubDBConfig } from '../../../index';
import { StreamSignaler } from '../../../services/signaler/stream';
import { RedisConnection } from '../../$setup/cache/ioredis';
import { RedisClientType } from '../../../types/ioredisclient';
import {
  StreamData,
  StreamDataResponse,
  StreamStatus } from '../../../types/stream';

describe('FUNCTIONAL | Status Codes', () => {
  const REASON = 'the account_id field is missing';
  const appConfig = { id: 'def' };
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
          topic: 'work.do',

          store: redisStore,
          stream: redisWorkerStream,
          sub: redisSub,

          callback: async (streamData: StreamData): Promise<StreamDataResponse> => {
            //this test
            let status: StreamStatus;
            let data: { [key: string]: string | number } = {
              code: streamData.data.code as number
            };
            if (streamData.data.code == 202) {
              data.percentage = 50;
              status = StreamStatus.PENDING;
            } else if (streamData.data.code == 422) {
              data.message = 'invalid input';
              data.reason = REASON;
              status = StreamStatus.ERROR;
            } else {
              data.code = 200;
              status = StreamStatus.SUCCESS;
            }
            return {
              code: data.code,
              status,
              metadata: { ...streamData.metadata },
              data
            } as StreamDataResponse;
          }
        }
      ]
    };
    pubSubDB = await PubSubDB.init(config);
    await pubSubDB.deploy('/app/tests/$setup/apps/def/v1/pubsubdb.yaml');
    await pubSubDB.activate('1');
  });

  afterAll(async () => {
    await StreamSignaler.stopConsuming();
    await RedisConnection.disconnectAll();
  });

  describe('Run Without Catch', () => {
    it('routes worker 200 and returns a success message', async () => {
      const payload = { code: 200 };
      const result = await pubSubDB.pubsub('def.test', payload);
      const data = result?.data as {
        code: number;
        message: string;
      };
      expect(data.code).toBe(payload.code);
      expect(data.message).toBe('success'); //static data in YAML file
    });

    it('does NOT catch worker 422 and returns an error message', async () => {
      const payload = { code: 422 };
      let data: {
        code: number;
        message: string;
        job_id: string;
      };
      try {
        await pubSubDB.pubsub('def.test', payload);
      } catch (err) {
        data = err
        expect(data.code).toBe(payload.code);
        expect(data.message).toBe('invalid input');
        expect(data.job_id).not.toBeUndefined();

        const state = await pubSubDB.getState('def.test', data.job_id);
      }
    });
  });

  describe('Run With Catch', () => {
    it('should hot deploy version 2', async () => {
      await pubSubDB.deploy('/app/tests/$setup/apps/def/v2/pubsubdb.yaml');
      await pubSubDB.activate('2');
    });

    it('routes worker 200 and returns a success message', async () => {
      const payload = { code: 200 };
      const result = await pubSubDB.pubsub('def.test', payload);
      const data = result?.data as {
        code: number;
        message: string;
      };
      expect(data.code).toBe(payload.code);
      expect(data.message).toBe('success'); //static data in YAML file
    });

    // it('catches worker 422 and returns a success message', async () => {
    //   const payload = { code: 422 };
    //   const result = await pubSubDB.pubsub('def.test', payload);
    //   const data = result?.data as {
    //     code: number;
    //     message: string;
    //     reason: string;
    //   };
    //   expect(data.code).toBe(payload.code);
    //   expect(data.message).toBe('success'); //static data in YAML file
    //   expect(data.reason).toBe(REASON);
    // });
  });
});
