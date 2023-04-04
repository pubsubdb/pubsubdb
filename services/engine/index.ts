import { StoreService } from '../store/store';
import Activities from './activities'

//when the engine is started, it will load the config from the config file
//it will then query redis for the version of the app/flows to use;
class EngineService {
  private store: StoreService;

  constructor(store: StoreService) {
    this.store = store;
  }

  async getSchema(topic: string): Promise<Record<string, unknown>> {
    //implement
    return {};
  }

  /**
   * get the pubsubdb manifest; this will provide a list of all the topics
   * that are available, etc.
   */
  async getManifest(): Promise<Record<string, unknown>> {
    const _manifest = await this.store.getManifest();
    return JSON.parse(_manifest);
  }

  async start(config: Record<string, string|number|boolean>) {
    
  }

  async pub(topic: string, data: Record<string, any>) {
    console.log('getting schema for topic (engine)', topic);
    const schema = await this.store.getSchema(topic);
    console.log('schema', topic, schema);
    const handler = Activities[schema.type];
    if (handler) {
      const activity = new handler(schema, data);
      await activity.process();
    }
  }

  sub(topic: string, callback: (data: Record<string, any>) => void) {
    //implement (subscribing is real-time and dies when the container dies...use models for persistent subscriptions)
  }
}

export { EngineService };
