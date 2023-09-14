import { WorkflowHandleService } from "./handle";
import { PubSubDBService as PubSubDB } from "../pubsubdb";
import { ClientConfig, Connection, WorkflowOptions } from "../../types/durable";
import { getWorkflowYAML } from "./factory";
import { JobState } from "../../types/job";

/*
Here is an example of how the methods in this file are used:

./client.ts

import { Durable } from '@pubsubdb/pubsubdb';
import Redis from 'ioredis';
import { example } from './workflows';
import { nanoid } from 'nanoid';

async function run() {
  const connection = await Durable.Connection.connect({
    class: Redis,
    options: {
      host: 'localhost',
      port: 6379,
    },
  });

  const client = new Durable.Client({
    connection,
  });

  const handle = await client.workflow.start({
    args: ['PubSubDB'],
    taskQueue: 'hello-world',
    workflowName: 'example',
    workflowId: 'workflow-' + nanoid(),
  });

  console.log(`Started workflow ${handle.workflowId}`);
  console.log(await handle.result());
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

*/

export class ClientService {

  connection: Connection;
  options: WorkflowOptions;
  static instances = new Map<string, PubSubDB | Promise<PubSubDB>>();

  constructor(config: ClientConfig) {
    this.connection = config.connection;
  }

  getPubSubDB = async (worflowTopic: string) => {
    if (ClientService.instances.has(worflowTopic)) {
      return await ClientService.instances.get(worflowTopic);
    }

    const pubSubDB = PubSubDB.init({
      appId: worflowTopic,
      engine: {
        redis: {
          class: this.connection.class,
          options: this.connection.options,
        }
      }
    });
    ClientService.instances.set(worflowTopic, pubSubDB);
    await this.activateWorkflow(await pubSubDB, worflowTopic);
    return pubSubDB;
  }

  workflow = {
    start: async (options: WorkflowOptions): Promise<WorkflowHandleService> => {
      const taskQueueName = options.taskQueue;
      const workflowName = options.workflowName;
      const trc = options.workflowTrace;
      const spn = options.workflowSpan;
      const workflowTopic = `${taskQueueName}-${workflowName}`;
      const pubSubDB = await this.getPubSubDB(workflowTopic);
      const payload = {
        arguments: [...options.args],
        workflowId: options.workflowId,
      }
      const context = { metadata: { trc, spn }, data: {}};
      const jobId = await pubSubDB.pub(workflowTopic, payload, context as JobState);
      return new WorkflowHandleService(pubSubDB, workflowTopic, jobId);
    },
  };

  async activateWorkflow(pubSubDB: PubSubDB, workflowTopic: string): Promise<void> {
    const version = '1';
    const app = await pubSubDB.engine.store.getApp(workflowTopic);
    const appVersion = app?.version as unknown as number;
    if(isNaN(appVersion)) {
      try {
        await pubSubDB.deploy(getWorkflowYAML(workflowTopic, version));
        await pubSubDB.activate(version);
      } catch (err) {
        pubSubDB.engine.logger.error('durable-client-workflow-activation-err', err);
        throw err;
      }
    }
  }

  static async shutdown(): Promise<void> {
    for (const [key, value] of ClientService.instances) {
      const pubSubDB = await value;
      await pubSubDB.stop();
    }
  }
}
