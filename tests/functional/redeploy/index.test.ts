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

describe('FUNCTIONAL | Redeploy', () => {
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
    it('deploys and activates version 1', async () => {
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
      const result = await pubSubDB.pubsub('spring', payload, null, 2_000);
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
      const result = await pubSubDB.pubsub('spring', payload, null, 2_000);
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
      const result = await pubSubDB.pubsub('spring', payload, null, 2_000);
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
      const result = await pubSubDB.pubsub('spring', payload, null, 2_000);
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
    it('deploys and activates version 6', async () => {
      await pubSubDB.deploy('/app/tests/$setup/apps/tree/v6/pubsubdb.yaml');
      const isActivated = await pubSubDB.activate('6');
      expect(isActivated).toBe(true);
    });
  });

  describe('Run Version', () => {
    it('should run a one-step flow with no mappings', async () => {
      const result = await pubSubDB.pubsub('spring', {});
      expect(result.metadata.js).toBe(0);
      expect(result.metadata.tpc).toBe('spring');
      expect(result.metadata.vrs).toBe('6');
    }, 2_500);
  });

  describe('Deploy and Activate', () => {
    it('deploys and activates version 7', async () => {
      await pubSubDB.deploy('/app/tests/$setup/apps/tree/v7/pubsubdb.yaml');
      const isActivated = await pubSubDB.activate('7');
      expect(isActivated).toBe(true);
    });
  });

  describe('Run Version', () => {
    it('should run a two-step flow with no mappings', async () => {
      const result = await pubSubDB.pubsub('spring', {});
      expect(result.metadata.js).toBe(0);
      expect(result.metadata.tpc).toBe('spring');
      expect(result.metadata.vrs).toBe('7');
    }, 2_500);
  });

  describe('Deploy and Activate', () => {
    it('deploys and activates version 8', async () => {
      await pubSubDB.deploy('/app/tests/$setup/apps/tree/v8/pubsubdb.yaml');
      const isActivated = await pubSubDB.activate('8');
      expect(isActivated).toBe(true);
    });
  });

  describe('Run Version', () => {
    it('should run nested flows', async () => {
      const result = await pubSubDB.pubsub('spring', {});
      expect(result.metadata.js).toBe(0);
      expect(result.metadata.tpc).toBe('spring');
      expect(result.metadata.vrs).toBe('8');
    }, 2_500);
  });

  describe('Hot Deploy', () => {
    it('should run, deploy, and activate multiple successive versions', async () => {
      //NOTE: this is the quick start tutorial run as a functional test
      const config: PubSubDBConfig = {
        appId: 'abc',
        logLevel: 'debug',
        engine: {
          redis: { class: Redis, options }
        },
        workers: [
          {
            topic: 'work.do',
            redis: { class: Redis, options },
            callback: async (data: StreamData) => {
              return {
                metadata: { ...data.metadata },
                data: { y: `${data?.data?.x} world` }
              };
            }
          },
          {
            topic: 'work.do.more',
            redis: { class: Redis, options },
            callback: async (data: StreamData) => {
              return {
                metadata: { ...data.metadata },
                data: { o: `${data?.data?.i} world` }
              };
            }
          }
        ]
      };
      const pubSubDB = await PubSubDB.init(config);

      await pubSubDB.deploy('/app/tests/$setup/apps/abc/v1/pubsubdb.yaml');
      await pubSubDB.activate('1');
      const response1 = await pubSubDB.pubsub('abc.test', {});
      expect(response1.metadata.jid).not.toBeUndefined();

      await pubSubDB.deploy('/app/tests/$setup/apps/abc/v2/pubsubdb.yaml');
      await pubSubDB.activate('2');
      const response2 = await pubSubDB.pubsub('abc.test', {});
      expect(response2.metadata.jid).not.toBeUndefined();

      await pubSubDB.deploy('/app/tests/$setup/apps/abc/v3/pubsubdb.yaml');
      await pubSubDB.activate('3');
      const response3 = await pubSubDB.pubsub('abc.test', {});
      expect(response3.metadata.jid).not.toBeUndefined();

      await pubSubDB.deploy('/app/tests/$setup/apps/abc/v4/pubsubdb.yaml');
      await pubSubDB.activate('4');
      const response4 = await pubSubDB.pubsub('abc.test', {});
      expect(response4.metadata.jid).not.toBeUndefined();

      await pubSubDB.deploy('/app/tests/$setup/apps/abc/v5/pubsubdb.yaml');
      await pubSubDB.activate('5');
      const response5 = await pubSubDB.pubsub('abc.test', { a : 'hello' });
      expect(response5.data.b).toBe('hello world');

      await pubSubDB.deploy('/app/tests/$setup/apps/abc/v6/pubsubdb.yaml');
      await pubSubDB.activate('6');
      const response6 = await pubSubDB.pubsub('abc.test', { a : 'hello' });
      expect(response6.data.b).toBe('hello world');
      expect(response6.data.c).toBe('hello world');

      await pubSubDB.deploy('/app/tests/$setup/apps/abc/v7/pubsubdb.yaml');
      await pubSubDB.activate('7');
      const response7 = await pubSubDB.pubsub('abc.test', { a : 'hello' });
      expect(response7.data.b).toBe('hello world');
      expect(response7.data.c).toBe('hello world world');

      await pubSubDB.deploy('/app/tests/$setup/apps/abc/v8/pubsubdb.yaml');
      await pubSubDB.activate('8');
      const response8 = await pubSubDB.pubsub('abc.test', { a : 'hello' });
      expect(response8.data.b).toBe('hello world');

      await pubSubDB.deploy('/app/tests/$setup/apps/abc/v9/pubsubdb.yaml');
      await pubSubDB.activate('9');
      const response9a = await pubSubDB.pubsub('abc.test', { a : 'hello' });
      expect(response9a.data.b).toBe('hello world');
      expect(response9a.data.c).toBe('hello world world');
      const response9b = await pubSubDB.pubsub('abc.test', { a : 'goodbye' });
      expect(response9b.data).toBeUndefined();
      const response9c = await pubSubDB.pubsub('abc.test', { a : 'help' });
      expect(response9c.data.b).toBe('help world');
      expect(response9c.data.c).toBeUndefined();
    }, 22_000);
  });
});
