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
import {
  StreamData,
  StreamDataResponse,
  StreamStatus } from '../../../types/stream';

describe('Worker', () => {
  const appConfig = { id: 'calc', version: '1' };
  let isSlow = true;
  const CONNECTION_KEY = 'manual-test-connection';
  const SUBSCRIPTION_KEY = 'manual-test-subscription';
  const STREAM_ENGINE_CONNECTION_KEY = 'manual-test-stream-engine-connection';
  const STREAM_WORKER_CONNECTION_KEY = 'manual-test-stream-worker-connection';
  let pubSubDB: PubSubDB;
  let pubSubDB2: PubSubDB;

  let counter = 0;

  //common callback function used by workers;
  // first call will hang for 6 seconds, subsequent calls will hang for 1 second
  // this is to simulate a slow/stalled/unresponsive worker being 'helped' by
  // the quorum of workers
  const callback =  async (streamData: StreamData): Promise<StreamDataResponse> => {
    const values = JSON.parse(streamData.data.values as string) as number[];
    const operation = streamData.data.operation as 'add'|'subtract'|'multiply'|'divide';
    const result = new NumberHandler()[operation](values);
    //let myCount = counter++;
    //console.time(`callback-${myCount}`);
    if (isSlow) {
      isSlow = false;
      await sleepFor(6_000);
    } else {
      await sleepFor(1_000);
    }
    //console.timeEnd(`callback-${myCount}`);
    return {
      status: StreamStatus.SUCCESS,
      metadata: { ...streamData.metadata },
      data: { result },
    } as StreamDataResponse;
  };

  beforeAll(async () => {

    const psdbFactory = async (version: string, first = false) => {
      //init Redis connections and clients
      const redisConnection = await RedisConnection.getConnection(`${CONNECTION_KEY}${version}`);
      const subscriberConnection = await RedisConnection.getConnection(`${SUBSCRIPTION_KEY}${version}`);
      const streamEngineConnection = await RedisConnection.getConnection(`${STREAM_ENGINE_CONNECTION_KEY}${version}`);
      const streamWorkerConnection = await RedisConnection.getConnection(`${STREAM_WORKER_CONNECTION_KEY}${version}`);
      const redisStorer = await redisConnection.getClient();
      const redisSubscriber = await subscriberConnection.getClient();
      const redisEngineStreamer = await streamEngineConnection.getClient();
      const redisWorkerStreamer = await streamWorkerConnection.getClient();
      first && redisStorer.flushdb();
      //wrap Redis clients in PubSubDB Redis client wrappers
      const redisStore = new IORedisStore(redisStorer);
      const redisEngineStream = new IORedisStream(redisEngineStreamer);
      const redisWorkerStream = new IORedisStream(redisWorkerStreamer);
      const redisSub = new IORedisSub(redisSubscriber);

      const config: PubSubDBConfig = {
        appId: appConfig.id,
        namespace: PSNS,
        logLevel: 'debug',
        engine: {
          store: redisStore,
          stream: redisEngineStream,
          sub: redisSub,
          xclaim: 1_500,  //default 5_000
        },
        workers: [
          {
            topic: 'calculation.execute',

            store: redisStore,
            stream: redisWorkerStream,
            sub: redisSub,
            xclaim: 1_500, //default 60_000

            callback,
          }
        ]
      };
      const instance = await PubSubDB.init(config);
      return instance;
    }
    pubSubDB = await psdbFactory('1', true);
    pubSubDB2 = await psdbFactory('2');
    await pubSubDB.deploy('/app/tests/$setup/apps/calc/v1/pubsubdb.yaml');
    await pubSubDB.activate(appConfig.version);
  });

  afterAll(async () => {
    await StreamSignaler.stopConsuming();
    await RedisConnection.disconnectAll();
  });

  beforeEach(() => {

  });

  describe('Claim failed tasks', () => {
    it('continues stalled jobs using xclaim', async () => {
      const payload = {
        operation: 'add',
        values: JSON.stringify([1, 2, 3, 4, 5]),
      };

      //job 1 is processed immediately by worker 1 and will sleep for 6s
      //jobs 2 and 3 (which last 1s) will be completed by the other worker
      //at which point the the second worker will take the job (xclaim)
      //and complete it. The stuck worker will eventually complete, but it
      //won't matter as the job will be completed by the other worker and
      //a warning will print to the log that the too-late response is ignored
      const jobId1 = await pubSubDB.pub('calculate', { ...payload });
      const jobId2 = await pubSubDB.pub('calculate', { ...payload });
      const jobId3 = await pubSubDB.pub('calculate', { ...payload });

      await sleepFor(3_000);
      let status1 = await pubSubDB2.getStatus(jobId1 as string);
      const status2 = await pubSubDB2.getStatus(jobId2 as string);
      const status3 = await pubSubDB2.getStatus(jobId3 as string);
      expect(status1).toEqual(680000000000000);
      expect(status2).toEqual(660000000000000);
      expect(status3).toEqual(660000000000000);

      await sleepFor(3_000);
      //verify that job 1 is completed after being reclaimed
      status1 = await pubSubDB2.getStatus(jobId1 as string);
      expect(status1).toEqual(660000000000000);
    }, 11_000);
  });
});
