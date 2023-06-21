import { ILogger } from '../logger';
import { StoreService } from '../store';
import { RedisClient, RedisMulti } from '../../types/redis';
import { HookInterface } from '../../types/hook';
import { XSleepFor, sleepFor } from '../../modules/utils';

const PERSISTENCE_SECONDS = 60;

class TaskService {
  store: StoreService<RedisClient, RedisMulti>;
  logger: ILogger;
  cleanupTimeout: NodeJS.Timeout | null = null;

  constructor(
    store: StoreService<RedisClient, RedisMulti>,
    logger: ILogger
  ) {
    this.logger = logger;
    this.store = store;
  }

  async processWorkItems(hookCallback: HookInterface): Promise<void> {
    const workItemKey = await this.store.getActiveTaskQueue();
    if (workItemKey) {
      const [topic, sourceKey, ...sdata] = workItemKey.split('::');
      const data = JSON.parse(sdata.join('::'));
      const destinationKey = `${sourceKey}:processed`;
      const jobId = await this.store.processTaskQueue(sourceKey, destinationKey);
      if (jobId) {
        await hookCallback(topic, { ...data, id: jobId });
        //todo: do final checksum count (values are tracked in the stats hash)
      } else {
        await this.store.deleteProcessedTaskQueue(workItemKey, sourceKey, destinationKey);
      }
      setImmediate(() => this.processWorkItems(hookCallback));
    }
  }

  async enqueueWorkItems(keys: string[]): Promise<void> {
    await this.store.addTaskQueues(keys);
  }

  async registerJobForCleanup(jobId: string, del = PERSISTENCE_SECONDS): Promise<void> {
    if (del > -1) {
      const deletionTime = Math.floor((Date.now() + del * 1000) / 60000) * 60000; //one minute deletion groups
      await this.store.registerJobForCleanup(jobId, deletionTime);
    }
  }

  async processCleanupItems(cleanupCallback: (jobId: string) => Promise<void>, listKey?: string): Promise<void> {
    const job = await this.store.getNextCleanupJob(listKey);
    if (job) {
      const [listKey, jobId] = job;
      await cleanupCallback(jobId);
      await sleepFor(10); //pause for 10ms to inerleave other tasks
      this.processCleanupItems(cleanupCallback, listKey);
    } else {
      let sleep = XSleepFor(PERSISTENCE_SECONDS * 1000);
      this.cleanupTimeout = sleep.timerId;
      await sleep.promise;
      this.processCleanupItems(cleanupCallback)
     }
  }

  cancelCleanup() {
    if (this.cleanupTimeout !== undefined) {
      clearTimeout(this.cleanupTimeout);
      this.cleanupTimeout = undefined;
    }
  }
}

export { TaskService };
