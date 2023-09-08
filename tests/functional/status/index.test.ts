import { nanoid } from 'nanoid';
import Redis from 'ioredis';

import config from '../../$setup/config';
import { PubSubDB, PubSubDBConfig } from '../../../index';
import { RedisConnection } from '../../../services/connector/clients/ioredis';
import { StreamSignaler } from '../../../services/signaler/stream';
import {
  StreamData,
  StreamDataResponse,
  StreamStatus } from '../../../types/stream';

describe('FUNCTIONAL | Status Codes', () => {
  const options = {
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD,
    database: config.REDIS_DATABASE,
  };
  const REASON = 'the account_id field is missing';
  const appConfig = { id: 'def' };
  let pubSubDB: PubSubDB;

  beforeAll(async () => {
    //init Redis and flush db
    const redisConnection = await RedisConnection.connect(nanoid(), Redis, options);
    redisConnection.getClient().flushdb();

    //init PubSubDB
    const psdbConfig: PubSubDBConfig = {
      appId: appConfig.id,
      logLevel: 'debug',

      engine: {
        redis: { class: Redis, options }
      },

      workers: [
        {
          topic: 'work.do',
          redis: { class: Redis, options },
          callback: async (streamData: StreamData): Promise<StreamDataResponse> => {
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

    pubSubDB = await PubSubDB.init(psdbConfig);
    await pubSubDB.deploy('/app/tests/$setup/apps/def/v1/pubsubdb.yaml');
    await pubSubDB.activate('1');
  }, 10_000);

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
