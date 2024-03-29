import { nanoid } from 'nanoid';
import Redis from 'ioredis';

import config from '../$setup/config';
import { PubSubDB, PubSubDBConfig } from '../../index';
import { JobStatsInput } from '../../types/stats';
import {
  StreamData,
  StreamDataResponse,
  StreamStatus } from '../../types/stream';
import { RedisConnection } from '../../services/connector/clients/ioredis';
import { StreamSignaler } from '../../services/signaler/stream';
import { JobOutput } from '../../types/job';
import { sleepFor } from '../../modules/utils';

describe('FUNCTIONAL | PubSubDB', () => {
  const options = {
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD,
    database: config.REDIS_DATABASE,
  };
  const appConfig = { id: 'test-app', version: '1' };
  let pubSubDB: PubSubDB;

  beforeAll(async () => {
    //flush db
    const redisConnection = await RedisConnection.connect(nanoid(), Redis, options);
    redisConnection.getClient().flushdb();
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
        logLevel: 'debug',

        engine: {
          redis: { class: Redis, options }
        },

        workers: [
          {
            topic: 'order.bundle',
            redis: { class: Redis, options },
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
        id: `wdg_${parseInt((Math.random() * 10_000_000).toString()).toString()}`,
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
        id: `wdg_${parseInt((Math.random() * 10_000_000).toString()).toString()}`, 
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
    }, 15_000);

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

      while(await pubSubDB.getStatus(jobId as string) !== 0) {
        await sleepFor(1000);
      }

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
      await pubSubDB.hook('order.routed', payload);
      while(await pubSubDB.getStatus(payload.id) !== 0) {
        await sleepFor(1000);
      }
      const status = await pubSubDB.getStatus(payload.id);
      expect(status).toBe(0);
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
      await sleepFor(1500);
      //todo: verify status of all target jobs by id!
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
