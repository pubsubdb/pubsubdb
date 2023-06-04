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
import { JobOutput } from '../../../typedefs/job';
import {
  StreamData,
  StreamDataResponse,
  StreamStatus } from '../../../typedefs/stream';

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

  //audit
  let timestampAfterAudit: number;

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
        store: redisStore, //ALWAYS OK to reuse a store connection
        stream: redisEngineStream, //NEVER OK to reuse a stream connection
        sub: redisSub, //ALWAYS OK for other subscription clients to re-use sub connections
      },
      workers: [
        {
          topic: 'calculation.execute',
          store: redisStore, //ALWAYS OK to reuse a store connection
          stream: redisWorkerStream, //NEVER OK to reuse a stream connection
          sub: redisSub, //ALWAYS OK for other subscription clients to re-use sub connections
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
    await pubSubDB.activate(appConfig.version);
  });

  afterAll(async () => {
    await StreamSignaler.stopConsuming();
    await RedisConnection.disconnectAll();
  });

  beforeEach(() => {

  });

  describe('Execute streamed tasks', () => {
    it('should invoke an exec activity (add) in calculator app', async () => {
      const payload = {
        operation: 'add',
        values: JSON.stringify([1, 2, 3, 4, 5]),
      };
      const jobResponse = await pubSubDB.pubsub('calculate', payload, 1500);
      expect(jobResponse?.metadata.jid).not.toBeNull();
      expect(jobResponse?.data.result).toBe(15);
    });

    it('should invoke an exec activity (subtract) in calculator app', async () => {
      const payload = {
        operation: 'subtract',
        values: JSON.stringify([5, 4, 3, 2, 1]),
      };
      const jobResponse = await pubSubDB.pubsub('calculate', payload);
      expect(jobResponse?.metadata.jid).not.toBeNull();
      expect(jobResponse?.data.result).toBe(-5);
    });

    it('should invoke an exec activity (multiply) in calculator app', async () => {
      const payload = {
        operation: 'multiply',
        values: JSON.stringify([5, 4, 3, 2, 1]),
      };
      const jobResponse = await pubSubDB.pubsub('calculate', payload);
      expect(jobResponse?.metadata.jid).not.toBeNull();
      expect(jobResponse?.data.result).toBe(120);
    });

    it('should invoke an exec activity (divide) in calculator app', async () => {
      const payload = {
        operation: 'divide',
        values: JSON.stringify([100, 4, 5]),
      };
      const jobResponse = await pubSubDB.pubsub('calculate', payload);
      expect(jobResponse?.metadata.jid).not.toBeNull();
      expect(jobResponse?.data.result).toBe(5);
    });

    it('should throw a timeout error and resolve by waiting longer', async () => {
      const payload = {
        operation: 'divide',
        values: JSON.stringify([100, 4, 5]),
      };
      //force a timeout error (0); resolve by waiting and calling 'get'
      try {
        await pubSubDB.pubsub('calculate', payload, 0);
      } catch (error) {
        //just because we got an error doesn't mean the job didn't keep running
        expect(error.type).toBe('timeout');
        const jobId = error.id;
        expect(jobId).not.toBeNull();
        //wait for a bit to make sure it completes then make assertions
        await sleepFor(1000);
        const jobData = await pubSubDB.get(jobId);
        expect(jobData?.result).toBe(5);
      }
    });

    it('should run synchronous calls in parallel', async () => {
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

    it('should subscribe to a topic to see all job results', async () => {
      let jobId: string;
      //subscribe to the 'calculated' topic
      await pubSubDB.sub('calculated', (topic: string, message: JobOutput) => {
        //results are broadcast here
        expect(topic).toBe('calculated');
        expect(message.data.result).toBe(5);
        //note: remove; v2 serializer will be exact and does not need the toString() call
        expect(message.metadata.jid.toString()).toBe(jobId.toString());
      });
      const payload = {
        operation: 'divide',
        values: JSON.stringify([100, 4, 5]),
      };
      //publish a job (sleep for 500, so the test doesn't exit tooo soon)
      jobId = await pubSubDB.pub('calculate', payload) as string;
      await sleepFor(500); //don't exit before event is received
    });
  });

  describe('audit', () => {
    it('should correctly aggregate data for the same 5s slot', () => {
      if (pubSubDB.engine?.streamSignaler?.currentBucket) {
        pubSubDB.engine.streamSignaler.currentBucket = null;
        pubSubDB.engine.streamSignaler.auditData.length = 0;
        pubSubDB.engine.streamSignaler.currentSlot = null;
      }
      pubSubDB.engine?.streamSignaler?.audit(10, 20, true);
      pubSubDB.engine?.streamSignaler?.audit(20, 30, false);
      timestampAfterAudit = Math.floor(Date.now() / 5000) * 5000; // floor to nearest 5s
      const auditData = pubSubDB.engine?.streamSignaler?.auditData;
      const auditDataForCurrentSlot = auditData?.find(data => data.t === timestampAfterAudit);
      expect(auditDataForCurrentSlot?.i).toBe(30);
      expect(auditDataForCurrentSlot?.o).toBe(50);
      expect(auditDataForCurrentSlot?.p).toBe(2);
      expect(auditDataForCurrentSlot?.f).toBe(1);
      expect(auditDataForCurrentSlot?.s).toBe(1);
    });
  });

  describe('cleanOldData', () => {
    it('should correctly remove items older than one hour', () => {
      if (pubSubDB.engine?.streamSignaler?.currentBucket) {
        const twoHoursAgo = Date.now() - 7200000;  // timestamp for two hours ago
        pubSubDB.engine.streamSignaler.currentBucket = {
          t: twoHoursAgo,
          i: 10,
          o: 20,
          p: 1,
          f: 0,
          s: 1,
        };
        pubSubDB.engine.streamSignaler.auditData = [pubSubDB.engine.streamSignaler.currentBucket];
      }
      pubSubDB.engine?.streamSignaler?.cleanOldData();
      expect(pubSubDB.engine?.streamSignaler?.auditData.length).toBe(0);
    });
  });

  describe('report', () => {
    it('should correctly return a report after auditing', () => {
      if (pubSubDB.engine?.streamSignaler?.currentBucket) {
        pubSubDB.engine.streamSignaler.currentBucket = null;
        pubSubDB.engine.streamSignaler.auditData.length = 0;
        pubSubDB.engine.streamSignaler.currentSlot = null;
      }
      pubSubDB.engine?.streamSignaler?.audit(10, 20, true);
      pubSubDB.engine?.streamSignaler?.audit(20, 30, false);
      const report = pubSubDB.engine?.streamSignaler?.report();
      expect(report?.namespace).toBe(pubSubDB.engine?.streamSignaler?.namespace);
      expect(report?.appId).toBe(pubSubDB.engine?.streamSignaler?.appId);
      expect(report?.guid).toBe(pubSubDB.engine?.streamSignaler?.guid);
      expect(report?.status).toBe('active');
      expect(report?.d.length).toBeGreaterThan(0);
    });
  });
});
