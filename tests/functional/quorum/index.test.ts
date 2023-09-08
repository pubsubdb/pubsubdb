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
import { QuorumMessage, ThrottleMessage } from '../../../types/quorum';
import { QuorumService } from '../../../services/quorum';

describe('FUNCTIONAL | Quorum', () => {
  const appConfig = { id: 'calc', version: '1' };
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
      namespace: PSNS,
      logLevel: 'debug',
      engine: {
        redis: { class: Redis, options }
      },
      workers: [
        {
          topic: 'calculation.execute',
          redis: { class: Redis, options },
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
  });

  afterAll(async () => {
    await StreamSignaler.stopConsuming();
    await RedisConnection.disconnectAll();
  });

  describe('Setup', () => {
    it('activates a version', async () => {
      const isActivated = await pubSubDB.activate(appConfig.version);
      expect(isActivated).toBe(true);
    });
  });

  describe('Run', () => {
    it('should run synchronous calls in parallel', async () => {
      const payload = {
        operation: 'divide',
        values: JSON.stringify([200, 4, 5]),
      };
      const [divide, b, c, d, multiply] = await Promise.all([
        pubSubDB.pubsub('calculate', payload, 5000),
        pubSubDB.pubsub('calculate', payload, 5000),
        pubSubDB.pubsub('calculate', payload, 5000),
        pubSubDB.pubsub('calculate', payload, 5000),
        pubSubDB.pubsub('calculate', {
          operation: 'multiply',
          values: JSON.stringify([10, 10, 10]),
        }, 5000),
      ]);
      expect(divide?.data.result).toBe(10);
      expect(multiply?.data.result).toBe(1000);
    }, 20_000);
  });

  describe('Pub Sub', () => {
    it('sends a `throttle` message targeting a worker (topic)', async () => {
      const callback = (topic: string, message: QuorumMessage) => {
        expect(['throttle', 'job'].includes(message.type)).toBeTruthy();
        expect((message as ThrottleMessage).topic).toBe('calculation.execute');
      };
      pubSubDB.quorum?.sub(callback);
      const throttleMessage: ThrottleMessage = {
        type: 'throttle',
        topic: 'calculation.execute',
        throttle: 1000,
      };
      await pubSubDB.quorum?.pub(throttleMessage);
      await sleepFor(1000);
      pubSubDB.quorum?.unsub(callback);
    });

    it('sends a `throttle` message targeting an engine (guid)', async () => {
      const callback = (topic: string, message: QuorumMessage) => {
        expect(['throttle', 'job'].includes(message.type)).toBeTruthy();
        expect((message as ThrottleMessage).guid).toBe(pubSubDB.quorum?.guid);
      };
      pubSubDB.quorum?.sub(callback);
      const throttleMessage: ThrottleMessage = {
        type: 'throttle',
        guid: pubSubDB.quorum?.guid,
        throttle: 1000,
      };
      await pubSubDB.quorum?.pub(throttleMessage);
      await sleepFor(1000);
      pubSubDB.quorum?.unsub(callback);
    });

    it('sends a `throttle` message to ALL quorum members', async () => {
      const callback = (topic: string, message: QuorumMessage) => {
        expect(['throttle', 'job'].includes(message.type)).toBeTruthy();
        expect((message as ThrottleMessage).guid).toBeUndefined();
        expect((message as ThrottleMessage).topic).toBeUndefined();
        expect((message as ThrottleMessage).throttle).toBe(500);
      };
      pubSubDB.quorum?.sub(callback);
      const throttleMessage: ThrottleMessage = {
        type: 'throttle',
        throttle: 500,
      };
      await pubSubDB.quorum?.pub(throttleMessage);
      await sleepFor(500);
      pubSubDB.quorum?.unsub(callback);
    });

    it('requests a quorum rollcall count', async () => {
      (pubSubDB.quorum as QuorumService).quorum = 0;
      await pubSubDB.quorum?.requestQuorum(1000);
      expect(pubSubDB.quorum?.quorum).toBe(1);
    });
  });
});
