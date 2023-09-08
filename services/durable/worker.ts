import { asyncLocalStorage } from './asyncLocalStorage';
import { PubSubDBService as PubSubDB } from '../pubsubdb';
import { RedisClass, RedisOptions } from '../../types/redis';
import { StreamData, StreamDataResponse, StreamStatus } from '../../types/stream';
import { ActivityDataType, Registry, WorkerConfig, WorkflowDataType } from "../../types/durable";
import { WorkflowService } from "./workflow";
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
  //will hold the imported activity functions
  static activityRegistry: Registry = {};

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

    //init activity and worker workflows
    const worker = new WorkerService();
    WorkflowService.activityRunner = await worker.initActivityWorkflow(config, activityTopic);
    await worker.activateActivityWorkflow(WorkflowService.activityRunner, activityTopic);
    WorkflowService.workflowRunner = await worker.initWorkerWorkflow(config, workflowTopic, workflowFunction);
    await worker.activateWorkerWorkflow(WorkflowService.workflowRunner, workflowTopic);
    return worker;
  }

  async run() {
    console.log('WorkerService is running');
  }

  async initActivityWorkflow(config: WorkerConfig, activityTopic: string): Promise<PubSubDB> {
    const redisConfig = {
      class: config.connection.class as RedisClass,
      options: config.connection.options as RedisOptions
    };
    return await PubSubDB.init({
      appId: activityTopic,
      engine: { redis: redisConfig },
      workers: [
        { topic: activityTopic,
          redis: redisConfig,
          callback: this.wrapActivityFunctions().bind(this)
        }
      ]
    });
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
        console.log('durable-activity-workflow-activation-error', err);
        throw err;
      }
    } else {
      await pubSubDB.activate(version);
    }
  }

  async initWorkerWorkflow(config: WorkerConfig, workflowTopic: string, workflowFunction: Function): Promise<PubSubDB> {
    const redisConfig = {
      class: config.connection.class as RedisClass,
      options: config.connection.options as RedisOptions
    };
    return await PubSubDB.init({
      appId: workflowTopic,
      engine: { redis: redisConfig },
      workers: [
        { topic: workflowTopic,
          redis: redisConfig,
          callback: this.wrapWorkflowFunction(workflowFunction, workflowTopic).bind(this)
        }
      ]
    });
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
        context.set('workflowId', workflowInput.workflowId);
        context.set('workflowTopic', workflowTopic);
        const workflowResponse = await asyncLocalStorage.run(context, async () => {
          return await workflowFunction.apply(this, workflowInput.arguments);
        });

        return {
          metadata: { ...data.metadata },
          data: { response: workflowResponse }
        };
      } catch (err) {
        //todo: error types: some are retryable, some are not
        console.error(err);
        return {
          code: 500,
          status: StreamStatus.PENDING,
          metadata: { ...data.metadata },
          data: { error: err }
        } as StreamDataResponse;
      }
    }
  }

  async activateWorkerWorkflow(pubSubDB: PubSubDB, workflowTopic: string) {
    const version = '1';
    const app = await pubSubDB.engine.store.getApp(workflowTopic);
    const appVersion = app?.version as unknown as number;
    if(isNaN(appVersion)) {
      try {
        await pubSubDB.deploy(getWorkflowYAML(workflowTopic, version));
        await pubSubDB.activate(version);
      } catch (err) {
        console.log('durable-worker-workflow-activation-error', err);
        throw err;
      }
    } else {
      await pubSubDB.activate(version);
    }
  }
}
