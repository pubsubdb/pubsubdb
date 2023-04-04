import { PubSubDBConfig } from '../../typedefs/pubsubdb';
import { EngineService } from '../engine';
import { ConnectorService } from '../connector';
import { StoreService } from '../store/store';

class PubSubDBService {
  private engine: EngineService | null;
  private connector: ConnectorService | null;
  private store: StoreService | null;

  constructor() {
    this.engine = null;
    this.connector = null;
    this.store = null;
  }

  init(config: PubSubDBConfig) {
    this.store = config.store;
    this.store.init();

    for (const Module of config.modules) {
      if (Module === EngineService) {
        this.engine = new EngineService(config.store);
      } else if (Module === ConnectorService) {
        this.connector = new ConnectorService();
      }
    }
  }

  getStore() {
    return this.store;
  }

  // Add other methods here
  pub(topic: string, data: Record<string, any>) {
    console.log('getting schema for topic', topic);
    if (!this.engine) throw new Error('Engine module not initialized; cannot publish');
    this.engine.pub(topic, data);
  }

  sub(topic: string, callback: (data: Record<string, any>) => void) {
    if (!this.engine) throw new Error('Engine module not initialized; cannot subscribe');
    this.engine.sub(topic, callback);
  }

  // todo: return a job by its id...convenience method for getting job data at any time
  get(key: string) {
    return this.store.get(key);
  }
}

export { PubSubDBService };
