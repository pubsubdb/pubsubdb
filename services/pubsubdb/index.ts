import { PubSubDBConfig } from '../../typedefs/pubsubdb';
import { ConnectionService } from '../connection';
import { StoreService } from '../store/store';
import Activities from './activities';

let instance: PubSubDBService;

/**
 * PubSubDBService is the main service and serves to orchestrate the activity flow
 * in the running application. it is responsible for initializing the store and
 * the connection, and also for subscribing to all topics.
 */
class PubSubDBService {
  private connection: ConnectionService | null;
  private store: StoreService | null;
  private cluster = false;
  

  /**
   * initialize pubsubdb. this will initialize the store and the connection. also
   * subscribe if in cluster mode
   * @param config 
   */
  static async init(config: PubSubDBConfig) {
    instance = new PubSubDBService();
    instance.cluster = config.cluster || false;
    instance.store = config.store;
    await instance.store.init();
    instance.connection = new ConnectionService();
    return instance;
  }

  getStore() {
    return this.store;
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
    if (this.cluster) {
      //subscribe to all topics (start creating/updating jobs)
    }
  }

  static stop(config: Record<string, string|number|boolean>) {
    if (instance?.cluster) {
      //unsubscribe from all topics (stop creating/updating jobs)
    }
  }

  /**
   * 
   * @param topic 
   * @param data 
   */
  async pub(topic: string, data: Record<string, any>) {
    const schema = await this.store.getSchema(topic);
    const handler = Activities[schema.type];
    if (handler) {
      const activity = new handler(schema, data);
      await activity.process();
    }
  }

  /**
   * subscribe to a topic
   * @param topic
   * @param callback 
   */
  sub(topic: string, callback: (data: Record<string, any>) => void) {
    //implement (subscribing is real-time and dies when the container dies...use models for persistent subscriptions)
  }

  /**
   * return a job by its id
   * @param key 
   * @returns 
   */
  get(key: string) {
    return this.store.get(key);
  }
}

export { PubSubDBService };
