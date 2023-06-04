import { ILogger } from '../logger';
import { StoreService } from '../store';
import { RedisClient, RedisMulti } from '../../typedefs/redis';
import { HookInterface } from '../../typedefs/hook';

class TaskService {
  store: StoreService<RedisClient, RedisMulti>;
  logger: ILogger;

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
      //call in next tick
      setImmediate(() => this.processWorkItems(hookCallback));
    }
  }

  async enqueueWorkItems(keys: string[]): Promise<void> {
    await this.store.addTaskQueues(keys);
  }
}

export { TaskService };
