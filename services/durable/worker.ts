import { asyncLocalStorage } from './asyncLocalStorage';
import { PubSubDBService as PubSubDB } from '../pubsubdb';
import { RedisClass, RedisOptions } from '../../types/redis';
import { StreamData, StreamDataResponse, StreamStatus } from '../../types/stream';
import { ActivityDataType, Connection, Registry, WorkerConfig, WorkflowDataType } from "../../types/durable";
import { getWorkflowYAML, getActivityYAML } from './factory';

/*
Here is an example of how the methods in this file are used:

./worker.ts

import { Durable: { NativeConnection, Worker } } from '@pubsubdb/pubsubdb';
import Redis from 'ioredis'; //OR `import * as Redis from 'redis';`

import * as activities from './activities';

async function run() {
  const connection = await NativeConnection.connect({
    class: Redis,
    options: {
      host: 'localhost',
      port: 6379,
    },
  });
  const worker = await Worker.create({
    connection,
    namespace: 'default',
    taskQueue: 'hello-world',
    workflowsPath: require.resolve('./workflows'),
    activities,
  });
  await worker.run();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
*/

export class WorkerService {
  static activityRegistry: Registry = {}; //user's activities
  static connection: Connection;
  static instances = new Map<string, PubSubDB | Promise<PubSubDB>>();
  workflowRunner: PubSubDB;

  static getPubSubDB = async (worflowTopic: string) => {
    if (WorkerService.instances.has(worflowTopic)) {
      return await WorkerService.instances.get(worflowTopic);
    }
    const pubSubDB = PubSubDB.init({
      appId: worflowTopic,
      engine: { redis: { ...WorkerService.connection } }
    });
    WorkerService.instances.set(worflowTopic, pubSubDB);
    await WorkerService.activateWorkflow(await pubSubDB, worflowTopic, getWorkflowYAML);
    return pubSubDB;
  }

  static async activateWorkflow(pubSubDB: PubSubDB, topic: string, factory: Function) {
    const version = '1';
    const app = await pubSubDB.engine.store.getApp(topic);
    const appVersion = app?.version;
    if(!appVersion) {
      try {
        await pubSubDB.deploy(factory(topic, version));
        await pubSubDB.activate(version);
      } catch (err) {
        pubSubDB.engine.logger.error('durable-worker-workflow-activation-error', err);
        throw err;
      }
    }
  }

  /**
   * The `worker` calls `registerActivities` immediately BEFORE
   * dynamically importing the user's workflow module. That file
   * contains a call, `proxyActivities`, which needs this info.
   * 
   * NOTE: The `worker` and `client` both call `proxyActivities`,
   * as a natural result of importing worflows.ts. However,
   * because the worker imports the workflows dynamically AFTER
   * the activities are loaded, there will be items in the registry,
   * allowing proxyActivities to succeed.
   */
  static registerActivities<ACT>(activities: ACT): Registry  {
    Object.keys(activities).forEach(key => {
      WorkerService.activityRegistry[key] = (activities as any)[key];
    });
    return WorkerService.activityRegistry;
  }

  static async create(config: WorkerConfig) {
    WorkerService.connection = config.connection;
    //pre-cache user activity functions
    WorkerService.registerActivities<typeof config.activities>(config.activities);
    //import the user's workflow file (triggers activity functions to be wrapped)
    const workflow = await import(config.workflowsPath);
    const workflowFunctionNames = Object.keys(workflow);
    const workflowFunctionName = workflowFunctionNames[workflowFunctionNames.length - 1];
    const workflowFunction = workflow[workflowFunctionName];
    const baseTopic = `${config.taskQueue}-${workflowFunctionName}`;
    const activityTopic = `${baseTopic}-activity`;
    const workflowTopic = `${baseTopic}`;

    //initialize supporting workflows
    const worker = new WorkerService();

    const activityRunner = await worker.initActivityWorkflow(config, activityTopic);
    await WorkerService.activateWorkflow(activityRunner, activityTopic, getActivityYAML);
    worker.workflowRunner = await worker.initWorkerWorkflow(config, workflowTopic, workflowFunction);
    await WorkerService.activateWorkflow(worker.workflowRunner, workflowTopic, getWorkflowYAML);
    return worker;
  }

  async run() {
    if (this.workflowRunner) {
      this.workflowRunner.engine.logger.info('WorkerService is running');
    } else {
      console.log('WorkerService is running');
    }
  }

  async initActivityWorkflow(config: WorkerConfig, activityTopic: string): Promise<PubSubDB> {
    const redisConfig = {
      class: config.connection.class as RedisClass,
      options: config.connection.options as RedisOptions
    };
    const psdbInstance = await PubSubDB.init({
      appId: activityTopic,
      engine: { redis: redisConfig },
      workers: [
        { topic: activityTopic,
          redis: redisConfig,
          callback: this.wrapActivityFunctions().bind(this)
        }
      ]
    });
    WorkerService.instances.set(activityTopic, psdbInstance);
    return psdbInstance;
  }

  wrapActivityFunctions(): Function {
    return async (data: StreamData): Promise<StreamDataResponse> => {
      try {
        //always run the activity function when instructed; return the response
        const activityInput = data.data as unknown as ActivityDataType;
        const activityName = activityInput.activityName;
        const activityFunction = WorkerService.activityRegistry[activityName];
        const pojoResponse = await activityFunction.apply(this, activityInput.arguments);

        return {
          status: StreamStatus.SUCCESS,
          metadata: { ...data.metadata },
          data: { response: pojoResponse }
        };
      } catch (err) {
        console.error(err);
        //todo (make retry configurable)
        return {
          status: StreamStatus.PENDING,
          metadata: { ...data.metadata },
          data: { error: err }
        } as StreamDataResponse;
      }
    }
  }

  async activateActivityWorkflow(pubSubDB: PubSubDB, activityTopic: string) {
    const version = '1';
    const app = await pubSubDB.engine.store.getApp(activityTopic);
    const appVersion = app?.version as unknown as number;
    if(isNaN(appVersion)) {
      try {
        await pubSubDB.deploy(getActivityYAML(activityTopic, version));
        await pubSubDB.activate(version);
      } catch (err) {
        console.log('durable-worker-activity-workflow-activation-error', err);
        throw err;
      }
    }
  }

  async initWorkerWorkflow(config: WorkerConfig, workflowTopic: string, workflowFunction: Function): Promise<PubSubDB> {
    const redisConfig = {
      class: config.connection.class as RedisClass,
      options: config.connection.options as RedisOptions
    };
    const psdbInstance = await PubSubDB.init({
      appId: workflowTopic,
      engine: { redis: redisConfig },
      workers: [
        { topic: workflowTopic,
          redis: redisConfig,
          callback: this.wrapWorkflowFunction(workflowFunction, workflowTopic).bind(this)
        }
      ]
    });
    WorkerService.instances.set(workflowTopic, psdbInstance);
    return psdbInstance;
  }

  static Context = {
    info: () => {
      return {
        workflowId: '',
        workflowTopic: '',
      }
    },
  };

  wrapWorkflowFunction(workflowFunction: Function, workflowTopic: string): Function {
    return async (data: StreamData): Promise<StreamDataResponse> => {
      try {
        //incoming data payload has arguments and workflowId
        const workflowInput = data.data as unknown as WorkflowDataType;
        const context = new Map();
        const counter = { counter: 0 };
        context.set('counter', counter);
        context.set('workflowId', workflowInput.workflowId);
        context.set('workflowTopic', workflowTopic);
        context.set('workflowName', workflowTopic.split('-').pop());
        context.set('workflowTrace', data.metadata.trc);
        context.set('workflowSpan', data.metadata.spn);
        const workflowResponse = await asyncLocalStorage.run(context, async () => {
          return await workflowFunction.apply(this, workflowInput.arguments);
        });

        return {
          code: 200,
          status: StreamStatus.SUCCESS,
          metadata: { ...data.metadata },
          data: { response: workflowResponse }
        };
      } catch (err) {
        //todo: (retryable error types)
        return {
          code: 500,
          status: StreamStatus.PENDING,
          metadata: { ...data.metadata },
          data: { error: err }
        } as StreamDataResponse;
      }
    }
  }

  static async shutdown(): Promise<void> {
    for (const [key, value] of WorkerService.instances) {
      const pubSubDB = await value;
      await pubSubDB.stop();
    }
  }
}
