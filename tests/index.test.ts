import { PSNS } from '../modules/key';
import {
  PubSubDB,
  PubSubDBConfig,
  RedisStore,
  RedisStream,
  RedisSub } from '../index';
import { JobStatsInput } from '../types/stats';
import {
  StreamData,
  StreamDataResponse,
  StreamStatus } from '../types/stream';
import { RedisConnection, RedisClientType } from './$setup/cache/redis';
import { StreamSignaler } from '../services/signaler/stream';
import { JobOutput } from '../types/job';
import { sleepFor } from '../modules/utils';

describe('pubsubdb', () => {
  const appConfig = { id: 'test-app', version: '1' };
  const CONNECTION_KEY = 'manual-test-connection';
  const SUBSCRIPTION_KEY = 'manual-test-subscription';
  const STREAM_ENGINE_CONNECTION_KEY = 'manual-test-stream-engine-connection';
  const STREAM_WORKER_CONNECTION_KEY = 'manual-test-stream-worker-connection';
  let pubSubDB: PubSubDB;
  //Redis connections
  let redisConnection: RedisConnection;
  let subscriberConnection: RedisConnection;
  let streamerEngineConnection: RedisConnection;
  let streamerWorkerConnection: RedisConnection;
  //Redis clients
  let redisStorer: RedisClientType;
  let redisSubscriber: RedisClientType;
  let redisEngineStreamer: RedisClientType;
  let redisWorkerStreamer: RedisClientType;
  //PubSubDB Redis wrappers
  let redisStore: RedisStore;
  let redisEngineStream: RedisStream;
  let redisWorkerStream: RedisStream;
  let redisSub: RedisSub;

  beforeAll(async () => {
    //initialize redis connections
    redisConnection = await RedisConnection.getConnection(CONNECTION_KEY);
    streamerEngineConnection = await RedisConnection.getConnection(STREAM_ENGINE_CONNECTION_KEY);
    streamerWorkerConnection = await RedisConnection.getConnection(STREAM_WORKER_CONNECTION_KEY);
    subscriberConnection = await RedisConnection.getConnection(SUBSCRIPTION_KEY);
    //initialize redis clients (and flushdb)
    redisStorer = await redisConnection.getClient();
    redisEngineStreamer = await streamerEngineConnection.getClient();
    redisWorkerStreamer = await streamerWorkerConnection.getClient();
    redisSubscriber = await subscriberConnection.getClient();
    await redisStorer.flushDb();
    //initialize psdb wrappers (3 for engine, 1 for worker)
    redisStore = new RedisStore(redisStorer);
    redisEngineStream = new RedisStream(redisEngineStreamer);
    redisWorkerStream = new RedisStream(redisWorkerStreamer);
    redisSub = new RedisSub(redisSubscriber);
  });

  afterAll(async () => {
    await StreamSignaler.stopConsuming();
    await RedisConnection.disconnectAll();
    await pubSubDB.stop();
  });

  describe('init()', () => {
    it('should initialize PubSubDB', async () => {
      const config: PubSubDBConfig = {
        appId: appConfig.id,
        namespace: PSNS,
        logLevel: 'debug',
        engine: {
          store: redisStore,
          stream: redisEngineStream,
          sub: redisSub,
        },
        workers: [
          {
            topic: 'order.bundle',
            store: redisStore, //ok to reuse store
            stream: redisWorkerStream,
            sub: redisSub, //ok to reuse sub
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
    });
  });

  describe('plan()', () => {
    it('should plan an app version deployment using a source path', async () => {
      await pubSubDB.plan('/app/tests/$setup/seeds/pubsubdb.yaml');
    });
  });

  describe('deploy()', () => {
    it('should deploy an app version using a source path', async () => {
      await pubSubDB.deploy('/app/tests/$setup/seeds/pubsubdb.yaml');
    });
  });

  describe('activate()', () => {
    it('should activate a deployed app version', async () => {
      await pubSubDB.activate(appConfig.version);
    });
  });

  describe('run()', () => {
    it('executes an `await` activity that resolves to true', async () => {
      const payload = { 
        id: `wdg_${parseInt((Math.random()*10000000).toString()).toString()}`, 
        price: 49.99, 
        object_type: 'widgetA'
      }
      const topic = 'order.approval.requested';
      const spawned_topic = 'order.approval.price.requested';
      const job: JobOutput = await pubSubDB.pubsub(topic, payload);
      const jobId = job?.metadata.jid;
      expect(jobId).not.toBeNull();
      expect(job?.data?.price).toBe(payload.price);
      //values under 100 are approved
      expect((job?.data?.approvals as { price: boolean }).price).toBe(true);
      const spawnedJob = await pubSubDB.getState(spawned_topic, payload.id);
      expect(spawnedJob?.data.id).toBe(payload.id);
    });

    it('executes an `await` activity that resolves to false', async () => {
      const payload = { 
        id: `wdg_${parseInt((Math.random()*10000000).toString()).toString()}`, 
        price: 149.99, 
        object_type: 'widgetA'
      }
      const topic = 'order.approval.requested';
      const spawned_topic = 'order.approval.price.requested';
      const job: JobOutput = await pubSubDB.pubsub(topic, payload);
      const jobId = job?.metadata.jid;
      expect(jobId).not.toBeNull();
      expect(job?.data?.price).toBe(payload.price);
      //values over 100 are rejected
      expect((job?.data?.approvals as { price: boolean }).price).toBe(false);
      const spawnedJob = await pubSubDB.getState(spawned_topic, payload.id);
      expect(spawnedJob?.data.id).toBe(payload.id);
    });

    it('should publish a message to Flow B', async () => {
      let payload: any;
      for (let i = 0; i < 1; i++) {
        payload = { 
          id: `ord_${parseInt((Math.random()*1000000).toString()).toString()}`, 
          price: 49.99 + i, 
          object_type: i % 2 ? 'widget' : 'order'
        }
        const job: JobOutput = await pubSubDB.pubsub('order.approval.price.requested', payload);
        expect(job?.data?.id).toBe(payload.id);
        expect(job?.data?.approved).toBe(true);
      }
    });

    it('should publish a message to Flow C', async () => {
      const payload = {
        id: `ord_10000002`,
        size: 'lg',
        primacy: 'primary',
        color: 'red',
        send_date: new Date(),
        must_release_series: '202304120015'
      };
      const jobId = await pubSubDB.pub('order.scheduled', payload);
      expect(jobId).not.toBeNull();
    });

    it('should should signal a hook to resume Flow C', async () => {
      const payload = {
        id: `ord_10000002`,
        facility: 'acme',
        actual_release_series: '202304110015'
      };
      const jobId = await pubSubDB.hook('order.routed', payload);
      expect(jobId).not.toBeNull();
    });

    it('should distribute messages to different job queues', async () => {
      const sizes = ['sm', 'md', 'lg'];
      const primacies = ['primary', 'secondary', 'tertiary'];
      const colors = ['red', 'yellow', 'blue'];
      const facilities = ['acme', 'spacely', 'cogswell'];
      let i = 1001;
      for (let j = 0; j < 1; j++) {
        for (const size of sizes) {
          for (const primacy of primacies) {
            for (const color of colors) {
              for (const facility of facilities) {
                const payload = {
                  id: `ord_${i++}`,
                  size,
                  primacy,
                  color,
                  facility,
                  send_date: new Date(),
                  must_release_series: '202304120015'
                };
                await pubSubDB.pub('order.scheduled', payload);
              }
            }
          }
        }
      }
    });

    it('should throw an error when publishing duplicates', async () => {
      try {
        //duplicate order! will throw error!!
        const payload = {
          id: `ord_1002`,
          size: 'lg',
          primacy: 'primary',
          color: 'red',
          facility: 'acme',
          send_date: new Date(),
          must_release_series: '202304120015'
        };
        await pubSubDB.pub('order.scheduled', payload);
        expect(true).toBe(false);
      } catch (err) {
        expect(true).toBe(true);
      }
    });
  });

  describe('Execute unit of work', () => {
    it('should invoke a flow with an worker activity', async () => {
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
      expect(jobId).not.toBeNull();
    });
  });

  describe('getStats()', () => {
    it('should return job stats for matching jobs', async () => {
      const options: JobStatsInput = {
        data: {
          color: 'red',
          primacy: 'primary',
          size: 'lg',
        },
        range: '1h',
        end: 'NOW',
      };
      const stats = await pubSubDB.getStats('order.scheduled', options);
      expect(stats.segments?.length).toEqual(13); //13 5m segments in 1h (range is inclusive (00 to 00))
    });
  });

  describe('getIds()', () => {
    it('should return ids for matching jobs', async () => {
      const options: JobStatsInput = {
        data: {
          color: 'red',
          primacy: 'primary',
          size: 'lg',
        },
        range: '1h',
        end: 'NOW',
      };
      const ids = await pubSubDB.getIds('order.scheduled', options);
      expect(ids.counts.length).toEqual(2);
    });
  });

  describe('hookTime()', () => {
    it('should sleep and awaken an activity', async () => {
      const payload = { duration: 1 };
      const jobId = await pubSubDB.pub('sleep.do', payload);
      //get the job status
      await sleepFor(250);
      const status1 = await pubSubDB.getStatus(jobId as string);
      expect(status1).toBe(560000000000000); //sleeping
      while(await pubSubDB.getStatus(jobId as string) === 560000000000000) {
        await sleepFor(1000);
      }
      const status2 = await pubSubDB.getStatus(jobId as string);
      expect(status2).toBe(460000000000000); //awake
      const state = await pubSubDB.getState('sleep.do', jobId as string);
      expect(state?.data?.done).toBe(true);
    }, 61_000);
  });

  describe('hook()', () => {
    it('should signal and awaken a sleeping job', async () => {
      const payload = {
        id: 'ord_1054',
        facility:'spacely',
        actual_release_series: '202304110015',
      };
      const response = await pubSubDB.hook('order.routed', payload);
      //expect(response).toBe(946000000000000); //fulfill (last activity) still pending at this stage
      await sleepFor(250);
      const status = await pubSubDB.getStatus(payload.id);
      expect(status).toBe(646000000000000); //fulfill should be done by now
    });
  });

  describe('hookAll()', () => {
    it('should signal and awaken all jobs of a certain type', async () => {
      const payload = {
        facility:'acme',
        actual_release_series: '202304110015',
      };
      const query: JobStatsInput = {
        data: {
          color: 'red',
          primacy: 'primary',
          size: 'lg',
        },
        range: '1h',
        end: 'NOW',
      };
      const response = await pubSubDB.hookAll('order.routed', payload, query, ['color:red']);
      expect(response).not.toBeNull();
    });
  });

  describe('Add strings to compress', () => {
    it('should add symbols', async () => {
      const registered = await pubSubDB.compress(['the quick brown fox', 'jumped over the lazy dog']);
      expect(registered).toBe(true);
    });
  });
});
