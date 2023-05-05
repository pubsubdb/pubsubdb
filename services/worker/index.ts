import { StoreService } from '../store';
import { AppVersion } from '../../typedefs/app';
import { ILogger } from '../logger';

class WorkerService {
  store: StoreService;
  logger: ILogger;
  appVersion: AppVersion;

  constructor(appVersion: AppVersion, store: StoreService, logger: ILogger) {
    this.appVersion = appVersion;
    this.logger = logger;
    this.store = store;
  }

  async processWorkItems(): Promise<void> {
    const workItemKey = await this.store.getActiveTaskQueue(this.appVersion);

    if (workItemKey) {
      // Process the work item.
      // ...

      // Move the work item to the processed list.
      const sourceKey = workItemKey;
      const destinationKey = `${workItemKey}:processed`;
      await this.store.processTaskQueue(sourceKey, destinationKey);

      // Scrub the work item.
      await this.store.deleteProcessedTaskQueue(sourceKey, destinationKey, this.appVersion);
    }
  }

  async enqueueWorkItems(keys: string[]): Promise<void> {
    await this.store.addTaskQueues(keys, this.appVersion);
  }
}

export { WorkerService };
