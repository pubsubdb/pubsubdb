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

describe('FUNCTIONAL | Parallel', () => {
  const appConfig = { id: 'tree' };
  const options = {
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD,
    database: config.REDIS_DATABASE,
  };
  let pubSubDB: PubSubDB;

  beforeAll(async () => {
    //init Redis and flush db
    const redisConnection = await RedisConnection.connect(nanoid(), Redis, options);
    redisConnection.getClient().flushdb();

    //init/activate PubSubDB (test both `engine` and `worker` roles)
    const config: PubSubDBConfig = {
      appId: appConfig.id,
      logLevel: 'debug',
      engine: {
        redis: { class: Redis, options }
      },
      workers: [
        {
          //worker activity in the YAML file declares 'summer' as the topic
          topic: 'summer',
          redis: { class: Redis, options },
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
    it('deploys and activates', async () => {
      await pubSubDB.deploy('/app/tests/$setup/apps/tree/v1/pubsubdb.yaml');
      const isActivated = await pubSubDB.activate('1');
      expect(isActivated).toBe(true);
    });
  });

  describe('Run Version', () => {
    it('should run and map activities in parallel', async () => {
      const payload = { seed: 2, speed: 3 };
      const result = await pubSubDB.pubsub('spring', payload, null, 1500);
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
});
