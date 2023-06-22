import { ILogger } from '../logger';
import { StoreService } from '../store';
import { RedisClient, RedisMulti } from '../../types/redis';
import { HookInterface } from '../../types/hook';

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
      await this.store.expireJob(jobId, del);
    }
  }
}

export { TaskService };
