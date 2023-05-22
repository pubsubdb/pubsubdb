import { PubSubDB, PubSubDBConfig, IORedisStore } from '../index';
import { RedisConnection, RedisClientType } from './$setup/cache/ioredis';
import { PSNS } from '../services/store/key';
import { JobStatsInput } from '../typedefs/stats';
import { StreamData, StreamDataResponse, StreamStatus } from '../typedefs/stream';

describe('pubsubdb', () => {
  const appConfig = { id: 'test-app', version: '1' };
  const CONNECTION_KEY = 'manual-test-connection';
  const SUBSCRIPTION_KEY = 'manual-test-subscription';
  const STREAM_CONNECTION_KEY = 'manual-test-stream-connection';
  let pubSubDB: PubSubDB;
  let redisConnection: RedisConnection;
  let subscriberConnection: RedisConnection;
  let streamerConnection: RedisConnection;
  let redisClient: RedisClientType;
  let redisSubscriber: RedisClientType;
  let redisStreamer: RedisClientType;
  let redisStore: IORedisStore;

  beforeAll(async () => {
    redisConnection = await RedisConnection.getConnection(CONNECTION_KEY);
    subscriberConnection = await RedisConnection.getConnection(SUBSCRIPTION_KEY);
    streamerConnection = await RedisConnection.getConnection(STREAM_CONNECTION_KEY);
    redisClient = await redisConnection.getClient();
    redisSubscriber = await subscriberConnection.getClient();
    redisStreamer = await streamerConnection.getClient();
    redisClient.flushdb();
    redisStore = new IORedisStore(redisClient, redisSubscriber, redisStreamer);
  });

  afterAll(async () => {
    await RedisConnection.disconnectAll();
  });

  describe('init()', () => {
    it('should initialize PubSubDB', async () => {
      const config: PubSubDBConfig = {
        appId: appConfig.id,
        namespace: PSNS,
        store: redisStore,
        //adapters are optional and will perform units of work as directed by the stream
        adapters: [
          {
            //any 'exec' activity with this topic as 'subtype' will be streamed the data
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
      const jobId = await pubSubDB.pub('order.approval.requested', payload);
      expect(jobId).not.toBeNull();
      await new Promise(resolve => setTimeout(resolve, 1000));
      const job = await pubSubDB.get(jobId) as { price: number, approvals: { price: boolean}};
      expect(job?.price).toBe(payload.price);
      //values under 49.99 are approved
      expect(job?.approvals?.price).toBe(true);
      const spawnedJob = await pubSubDB.get(payload.id);
      expect(spawnedJob?.id).toBe(payload.id);
    }, 10000);

    it('executes an `await` activity that resolves to false', async () => {
      const payload = { 
        id: `wdg_${parseInt((Math.random()*10000000).toString()).toString()}`, 
        price: 149.99, 
        object_type: 'widgetA'
      }
      const jobId = await pubSubDB.pub('order.approval.requested', payload);
      expect(jobId).not.toBeNull();
      await new Promise(resolve => setTimeout(resolve, 1000));
      const job = await pubSubDB.get(jobId) as { price: number, approvals: { price: boolean}};
      expect(job?.price).toBe(payload.price);
      //values over 100 are rejected
      expect(job?.approvals?.price).toBe(false);
      const spawnedJob = await pubSubDB.get(payload.id);
      expect(spawnedJob?.id).toBe(payload.id);
    }, 10000);

    it('should publish a message to Flow B', async () => {
      let payload: any;
      for (let i = 0; i < 1; i++) {
        payload = { 
          id: `ord_${parseInt((Math.random()*1000000).toString()).toString()}`, 
          price: 49.99 + i, 
          object_type: i % 2 ? 'widget' : 'order'
        }
        await pubSubDB.pub('order.approval.price.requested', payload);
        await new Promise(resolve => setTimeout(resolve, 1000));
        const job = await pubSubDB.get(payload.id) as { id: string, approved: boolean };
        expect(job?.id).toBe(payload.id);
        expect(job?.approved).toBe(true);
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
      const pubResponse = await pubSubDB.pub('order.scheduled', payload);
      await new Promise(resolve => setTimeout(resolve, 1000));
      expect(pubResponse).not.toBeNull();
    }, 100000);

    it('should should signal a hook to resume Flow C', async () => {
      const payload = {
        id: `ord_10000002`,
        facility: 'acme',
        actual_release_series: '202304110015'
      };
      const hookResponse = await pubSubDB.hook('order.routed', payload);
      await new Promise(resolve => setTimeout(resolve, 1000));
      expect(hookResponse).not.toBeNull();
    }, 100000);

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
      //todo:locate all data in redis and verify
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
    it('should invoke a flow with an exec activity', async () => {
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
      const pubResponse = await pubSubDB.pub('order.finalize', payload);
      await new Promise(resolve => setTimeout(resolve, 1000));
      expect(pubResponse).not.toBeNull();
      const jobResponse = await pubSubDB.get(payload.id);
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

  describe('hook()', () => {
    it('should signal and awaken a sleeping job', async () => {
      const payload = {
        id: 'ord_1054',
        facility:'spacely',
        actual_release_series: '202304110015',
      };
      const response = await pubSubDB.hook('order.routed', payload);
      await new Promise(resolve => setTimeout(resolve, 1000));
      expect(response).not.toBeNull();
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
      await new Promise(resolve => setTimeout(resolve, 1000));
      expect(response).not.toBeNull();
    });
  });
});
