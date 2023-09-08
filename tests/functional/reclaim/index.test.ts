import { nanoid } from 'nanoid';
import Redis from 'ioredis';

import config from '../../$setup/config';
import { PSNS } from '../../../modules/key';
import { sleepFor } from '../../../modules/utils';
import { PubSubDB, PubSubDBConfig } from '../../../index';
import { NumberHandler } from '../../../services/pipe/functions/number';
import { StreamSignaler } from '../../../services/signaler/stream';
import { RedisConnection } from '../../../services/connector/clients/ioredis';

import {
  StreamData,
  StreamDataResponse,
  StreamStatus } from '../../../types/stream';

describe('FUNCTIONAL | Reclaim', () => {
  const appConfig = { id: 'calc', version: '1' };
  const options = {
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD,
    database: config.REDIS_DATABASE,
  };
  let isSlow = true;
  let pubSubDB: PubSubDB;
  let pubSubDB2: PubSubDB;

  //Thi is the common callback function used by workers during the test runs
  // The first call will hang for 6 seconds; subsequent calls will hang for 1 second
  // This is to simulate a slow/stalled/unresponsive worker being 'helped' by
  // the quorum of workers. When the latter calls complete, they' claim the
  // message out from under the first worker (the reclaim timeout is configured to
  // be short during testing (1500ms))
  const callback =  async (streamData: StreamData): Promise<StreamDataResponse> => {
    const values = JSON.parse(streamData.data.values as string) as number[];
    const operation = streamData.data.operation as 'add'|'subtract'|'multiply'|'divide';
    const result = new NumberHandler()[operation](values);

    if (isSlow) {
      isSlow = false;
      await sleepFor(6_000);
    } else {
      await sleepFor(1_000);
    }
    return {
      status: StreamStatus.SUCCESS,
      metadata: { ...streamData.metadata },
      data: { result },
    } as StreamDataResponse;
  };

  beforeAll(async () => {

    const psdbFactory = async (version: string, first = false) => {
      if (first) {
        const redisConnection = await RedisConnection.connect(nanoid(), Redis, options);
        redisConnection.getClient().flushdb();    
      }
 
      const config: PubSubDBConfig = {
        appId: appConfig.id,
        namespace: PSNS,
        logLevel: 'debug',
        engine: {
          redis: { class: Redis, options },
          reclaimDelay: 1_500,  //default 5_000
        },
        workers: [
          {
            topic: 'calculation.execute',
            redis: { class: Redis, options },
            reclaimDelay: 1_500, //default 60_000
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

      //Job 1 is processed immediately by worker 1 and will sleep for 6s.
      //Jobs 2 and 3 (which last 1s each) will be completed by the second worker.
      //At this point the the second worker will be bored and take the job (xclaim)
      //and complete it. The first worker will eventually resume after 6s, but it
      //won't matter as the job will have been completed by the second worker and
      //a warning will print to the log that the `too-late` response was ignored
      const jobId1 = await pubSubDB.pub('calculate', { ...payload });
      let status1 = await pubSubDB2.getStatus(jobId1 as string);
      const jobId2 = await pubSubDB.pub('calculate', { ...payload });
      const jobId3 = await pubSubDB.pub('calculate', { ...payload });
      expect(status1).toEqual(1);

      //as long as the other jobs are in process the first job will be 1
      while(
        await pubSubDB.getStatus(jobId2 as string) !== 0 ||
        await pubSubDB.getStatus(jobId3 as string) !== 0) {
        status1 = await pubSubDB2.getStatus(jobId1 as string);
        expect(status1).toEqual(1);
        await sleepFor(1000);
      }

      //give time for the free worker to claim the job
      await sleepFor(3_000);
      //verify that job 1 is completed after being reclaimed
      status1 = await pubSubDB2.getStatus(jobId1 as string);
      expect(status1).toEqual(0);
    }, 11_000);
  });
});
