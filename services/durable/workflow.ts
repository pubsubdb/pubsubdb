import ms from 'ms';

import { asyncLocalStorage } from './asyncLocalStorage';
import { WorkerService } from './worker';
import { PubSubDBService as PubSubDB } from "../pubsubdb";
import { ActivityConfig, ContextType, ProxyType } from "../../types/durable";
import { JobOutput } from '../../types';

/*
`proxyActivities` returns a wrapped instance of the 
target activity, so that when the workflow calls a
proxied activity, it is actually calling the proxy
function, which in turn calls the activity function.

`proxyActivities` must be called AFTER the activities
have been registered in order to work properly.
If the activities are not already registered,
`proxyActivities` will throw an error. This is OK.

The `client` (client.ts) is equivalent to the PubSubDB
`engine`, so it will initialize an engine instance and even
deploy and activate a new workflow if necessary and only then
will it create jobs. The jobs will be published and
put in the queue. When the `worker` (worker.ts)
is eventually initialized (if it happens to be inited later),
it will see the items in the queue and process them. If it happens
to already be inited, the jobs will immediately be dequeued and
processed. In either case, the jobs will be processed.

Here is an example of how the methods in this file are used:

./workflows.ts

import { Durable: { workflow }} from '@pubsubdb/pubsubdb';
import type * as activities from './activities';
const { greet } = workflow.proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
  retryPolicy: {
    initialInterval: '5 seconds',  // Initial delay between retries
    maximumAttempts: 3,            // Max number of retry attempts
    backoffCoefficient: 2.0,       // Backoff factor for delay between retries: delay = initialInterval * (backoffCoefficient ^ retry_attempt)
    maximumInterval: '30 seconds', // Max delay between retries
  },
});

export async function example(name: string): Promise<string> {
  return await greet(name);
}
*/

export class WorkflowService {
  static activityRunner: PubSubDB;
  static workflowRunner: PubSubDB;

  static proxyActivities<ACT>(options?: ActivityConfig): ProxyType<ACT> {
    const proxy: any = {};
    const keys = Object.keys(WorkerService.activityRegistry);
    if (keys.length) {
      keys.forEach((key: string) => {
        const activityFunction = WorkerService.activityRegistry[key];
        proxy[key] = WorkflowService.wrapActivity<typeof activityFunction>(key, options);
      });
    }
    return proxy;
  }

  static wrapActivity<T>(activityName: string, options?: ActivityConfig): T {
    return async function() {
      const store = asyncLocalStorage.getStore();
      if (!store) {
        throw new Error('durable-store-not-found');
      }
      const workflowId = store.get('workflowId');
      const workflowTopic = store.get('workflowTopic');
      const activityTopic = `${workflowTopic}-activity`;
      const activityJobId = `${workflowId}-${activityName}`;

      let activityState: JobOutput
      try {
        activityState = await WorkflowService.activityRunner.getState(activityTopic, activityJobId);
        return activityState.data as T;
      } catch (e) {
        const duration = ms(options?.startToCloseTimeout || '1 minute');
        const payload = {
          arguments: Array.from(arguments),
          workflowId: activityJobId,
          workflowTopic,
          activityName,
        };
        const jobOutput = await WorkflowService.activityRunner.pubsub(activityTopic, payload, duration);
        return jobOutput.data.response as T;
      }
    } as T;
  }
}
