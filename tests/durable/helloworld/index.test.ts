import Redis from 'ioredis';

import config from '../../$setup/config'
import { Durable } from '../../../services/durable';
import * as activities from './src/activities';
import { nanoid } from 'nanoid';
import { WorkflowHandleService } from '../../../services/durable/handle';


const { Connection, Client, NativeConnection, Worker } = Durable;

describe('Durable', () => {
  let handle: WorkflowHandleService;

  describe('Connection', () => {
    describe('connect', () => {
      it('should connect to Redis', async () => {
        const connection = await Connection.connect({
          class: Redis,
          options: {
            host: config.REDIS_HOST,
            port: config.REDIS_PORT,
            password: config.REDIS_PASSWORD,
            database: config.REDIS_DATABASE,
          },
        });
        expect(connection).toBeDefined();
        expect(connection.options).toBeDefined();
      });
    });
  });

  describe('Client', () => {
    describe('start', () => {
      it('should connect a client and start a workflow execution', async () => {
        //connect the client to Redis
        const connection = await Connection.connect({
          class: Redis,
          options: {
            host: 'redis',
            port: 6379,
            password: 'key_admin',
          },
        });
        const client = new Client({
          connection,
        });
        //`handle` is a global variable.
        //start the workflow (it will be executed by the worker...see below)
        handle = await client.workflow.start({
          args: ['PubSubDB'],
          taskQueue: 'hello-world',
          workflowName: 'example',
          workflowId: 'workflow-' + nanoid(),
        });
        expect(handle.workflowId).toBeDefined();
      });
    });
  });

  describe('Worker', () => {
    describe('create', () => {
      it('should create and run a worker', async () => {
        //connect to redis
        const connection = await NativeConnection.connect({
          class: Redis,
          options: {
            host: config.REDIS_HOST,
            port: config.REDIS_PORT,
            password: config.REDIS_PASSWORD,
            database: config.REDIS_DATABASE,
          },
        });
        //create a worker (drains items from the queue/stream)
        const worker = await Worker.create({
          connection,
          namespace: 'default',
          taskQueue: 'hello-world',
          workflowsPath: require.resolve('./src/workflows'),
          activities,
        });
        await worker.run();
        expect(worker).toBeDefined();
      });
    });
  });

  describe('WorkflowHandle', () => {
    describe('result', () => {
      it('should return the workflow execution result', async () => {
        const result = await handle.result();
        expect(result).toEqual('Hello, PubSubDB!');
      }, 10_000);
    });
  });
});
