import { StoreService } from '../store';
import { AppVersion } from '../../typedefs/app';
import { ILogger } from '../logger';
import { PubSubDBService } from '../pubsubdb';

class WorkerService {
  appVersion: AppVersion;
  pubsSubDB: PubSubDBService;
  store: StoreService;
  logger: ILogger;

  constructor(appVersion: AppVersion,
    pubSubDB: PubSubDBService,
    store: StoreService,
    logger: ILogger) {
      this.appVersion = appVersion;
      this.pubsSubDB = pubSubDB;
      this.logger = logger;
      this.store = store;
  }

  async processWorkItems(): Promise<void> {
    const workItemKey = await this.store.getActiveTaskQueue(this.appVersion);
    if (workItemKey) {
      const [topic, sourceKey, ...sdata] = workItemKey.split('::');
      const data = JSON.parse(sdata.join('::'));
      const destinationKey = `${sourceKey}:processed`;
      const jobId = await this.store.processTaskQueue(sourceKey, destinationKey);
      if (jobId) {
        await this.pubsSubDB.hook(topic, {...data, id: jobId });
        //todo: do final checksum count (values are tracked in the stats hash)
      } else {
        await this.store.deleteProcessedTaskQueue(workItemKey, sourceKey, destinationKey, this.appVersion);
      }
      //call in next tick
      setImmediate(() => this.processWorkItems());
    }
  }

  async enqueueWorkItems(keys: string[]): Promise<void> {
    await this.store.addTaskQueues(keys, this.appVersion);
  }
}

export { WorkerService };
