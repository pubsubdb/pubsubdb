import { nanoid } from 'nanoid';
import Redis from 'ioredis';

import config from '../../$setup/config';
import { PSNS } from '../../../modules/key';
import { sleepFor } from '../../../modules/utils';
import { PubSubDB, PubSubDBConfig } from '../../../index';
import { RedisConnection } from '../../../services/connector/clients/ioredis';
import { NumberHandler } from '../../../services/pipe/functions/number';
import { StreamSignaler } from '../../../services/signaler/stream';
import { JobOutput } from '../../../types/job';
import {
  StreamData,
  StreamDataResponse,
  StreamStatus } from '../../../types/stream';

describe('FUNCTIONAL | Retry', () => {
  const appConfig = { id: 'calc', version: '1' };
  const options = {
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD,
    database: config.REDIS_DATABASE,
  };
  const UNRECOVERABLE_ERROR = {
    message: 'unrecoverable error',
    code: 403,
  };
  let simulateOneTimeError = true;
  let simulateUnrecoverableError = false;
  let pubSubDB: PubSubDB;

  //worker callback function
  const callback =  async (streamData: StreamData): Promise<StreamDataResponse> => {
    const values = JSON.parse(streamData.data.values as string) as number[];
    const operation = streamData.data.operation as 'add'|'subtract'|'multiply'|'divide';
    const result = new NumberHandler()[operation](values);

    if (simulateUnrecoverableError) {
      simulateUnrecoverableError = false;
      //simulate an error for which there is no retry policy
      return {
        status: StreamStatus.ERROR,
        code: UNRECOVERABLE_ERROR.code,
        metadata: { ...streamData.metadata },
        data: { code: UNRECOVERABLE_ERROR.code, message: UNRECOVERABLE_ERROR.message },
      } as StreamDataResponse;

    } else if (simulateOneTimeError) {
      simulateOneTimeError = false;
      //simulate a system error and retry
      //YAML config says to retry 500 3x
      return {
        status: StreamStatus.ERROR,
        code: 500,
        metadata: { ...streamData.metadata },
        data: { error: 'recoverable error' },
      } as StreamDataResponse;

    } else {
      return {
        status: StreamStatus.SUCCESS,
        metadata: { ...streamData.metadata },
        data: { result },
      } as StreamDataResponse;
    }
  };

  beforeAll(async () => {
    //init Redis and flush db
    const redisConnection = await RedisConnection.connect(nanoid(), Redis, options);
    redisConnection.getClient().flushdb();

    const config: PubSubDBConfig = {
      appId: appConfig.id,
      namespace: PSNS,
      logLevel: 'debug',

      engine: {
        redis: { class: Redis, options }
      },

      workers: [
        {
          topic: 'calculation.execute',
          redis: { class: Redis, options },
          callback,
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
    it('should invoke a worker activity (add) in calculator app', async () => {
      const payload = {
        operation: 'add',
        values: JSON.stringify([1, 2, 3, 4, 5]),
      };
      const jobResponse = await pubSubDB.pubsub('calculate', payload, null, 2500);
      expect(jobResponse?.metadata.jid).not.toBeNull();
      expect(jobResponse?.data.result).toBe(15);
    });

    it('should invoke a worker activity (subtract) in calculator app', async () => {
      const payload = {
        operation: 'subtract',
        values: JSON.stringify([5, 4, 3, 2, 1]),
      };
      const jobResponse = await pubSubDB.pubsub('calculate', payload, null, 2500);
      expect(jobResponse?.metadata.jid).not.toBeNull();
      expect(jobResponse?.data.result).toBe(-5);
    });

    it('should invoke a worker activity (multiply) in calculator app', async () => {
      const payload = {
        operation: 'multiply',
        values: JSON.stringify([5, 4, 3, 2, 1]),
      };
      const jobResponse = await pubSubDB.pubsub('calculate', payload, null, 2500);
      expect(jobResponse?.metadata.jid).not.toBeNull();
      expect(jobResponse?.data.result).toBe(120);
    });

    it('should invoke a worker activity (divide) in calculator app', async () => {
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
        await pubSubDB.pubsub('calculate', payload, null, 0);
      } catch (error) {
        //just because we got an error doesn't mean the job didn't keep running
        expect(error.message).toBe('timeout');
        expect(error.job_id).not.toBeNull();
        //wait for a bit to make sure it completes then make assertions
        await sleepFor(1000);
        const state = await pubSubDB.getState('calculate', error.job_id);
        expect(state?.data?.result).toBe(5);
        const status = await pubSubDB.getStatus(error.job_id);
        //this is a two-activity flow. successful termination is '6' for each
        expect(status).toBe(0);
      }
    });

    it('should run synchronous calls in parallel', async () => {
      const [divide, multiply] = await Promise.all([
        pubSubDB.pubsub('calculate', {
          operation: 'divide',
          values: JSON.stringify([200, 4, 5]),
        }, null, 1500),
        pubSubDB.pubsub('calculate', {
          operation: 'multiply',
          values: JSON.stringify([10, 10, 10]),
        }, null, 1500),
      ]);
      expect(divide?.data.result).toBe(10);
      expect(multiply?.data.result).toBe(1000);
    }, 3000);

    it('should manually delete a completed job', async () => {
      const payload = {
        operation: 'divide',
        values: JSON.stringify([100, 4, 5]),
      };
      const jobResponse = await pubSubDB.pubsub('calculate', payload);
      expect(jobResponse?.metadata.jid).not.toBeNull();
      expect(jobResponse?.data.result).toBe(5);
      //delete the job
      const jobId = jobResponse?.metadata.jid;
      const state1 = await pubSubDB.getState('calculate', jobId);
      expect(state1).not.toBeNull();
      await pubSubDB.scrub(jobId);
      try {
        await pubSubDB.getState('calculate', jobId);
        expect(true).toBe(false);
      } catch (e) {
        expect(e.message).toContain('not found');
      }
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
      await sleepFor(500);
      await pubSubDB.unsub('calculated');
    });

    it('should return an error if the job throws an error', async () => {
      //set flag that will cause our test worker to return an unrecoverable error
      simulateUnrecoverableError = true;
      const payload = {
        operation: 'divide',
        values: JSON.stringify([100, 4, 5]),
      };
      try {
        await pubSubDB.pubsub('calculate', payload);
      } catch (error) {
        expect(error.message).toBe(UNRECOVERABLE_ERROR.message);
        expect(error.code).toBe(UNRECOVERABLE_ERROR.code);
        expect(error.job_id).not.toBeNull();
        const jobMetaData = await pubSubDB.getState('calculate', error.job_id);
        expect(jobMetaData?.metadata.err).not.toBeNull();
        expect(jobMetaData?.metadata.err).toBe('{"message":"unrecoverable error","code":403}');
      }
    });
  });
});
