import { ActivityMetadata } from '../../typedefs/activity';
import { PubSubDBApps, PubSubDBConfig, PubSubDBSettings } from '../../typedefs/pubsubdb';
import { CompilerService } from '../compiler';
import { AdapterService } from '../adapter';
import { StoreService } from '../store/store';
import Activities from './activities';
import { ActivityType } from './activities/activity';
import { JobContext } from '../../typedefs/job';

//todo: can be multiple instances; track as a Map
let instance: PubSubDBService;

/**
 * PubSubDBService orchestrates the activity flow
 * in the running application by locating the instructions for each activity
 * each time a message is received. the instructions are then executed by
 * whichever activity instance is appropriate (given the type of activity)
 */
class PubSubDBService {
  namespace: string;
  appId: string;
  store: StoreService | null;
  apps: PubSubDBApps | null;
  cluster = false;
  adapterService: AdapterService | null;

  static stop(config: Record<string, string|number|boolean>) {
    if (instance?.cluster) {
      //unsubscribe from all topics (stop creating/updating jobs)
    }
  }

  async start(config: Record<string, string|number|boolean>) {
    if (this.cluster) {
      //subscribe to all topics (start creating/updating jobs)
    }
  }

  verifyNamespace(namespace: string) {
    if (!namespace.match(/^[A-Za-z0-9-]+$/)) {
      throw new Error(`namespace ${namespace} is invalid`);
    } else {
      this.namespace = namespace;
    }
  }

  verifyAppId(appId: string) {
    if (!appId.match(/^[A-Za-z0-9-]+$/)) {
      throw new Error(`appId ${appId} is invalid`);
    } else if (appId === 'app') {
      throw new Error(`appId ${appId} is reserved`);
    } else {
      this.appId = appId;
    }
  }

  async verifyStore(store: StoreService) {
    if (!(store instanceof StoreService)) {
      throw new Error(`store ${store} is invalid`);
    } else {
      this.store = store;
      this.apps = await this.store.init(this.namespace, this.appId);
    }
  }

  getAppConfig() {
    return { id: this.appId, version: this.apps![this.appId].version };
  }

  /**
   * initialize pubsubdb (this will initialize the store); the store serves as the interface
   * between the local cache and the remote Redis data store.
   * subscribe if in cluster mode
   * @param config 
   */
  static async init(config: PubSubDBConfig) {
    instance = new PubSubDBService();
    instance.verifyNamespace(config.namespace);
    instance.verifyAppId(config.appId);
    await instance.verifyStore(config.store);
    instance.cluster = config.cluster || false;
    instance.adapterService = new AdapterService();
    return instance;
  }

  isPrivate(topic: string) {
    return topic.startsWith('.');
  }

  /**
   * returns a tuple containing the activity id and the activity schema
   * for the single activity that is subscribed to the provided topic
   * @param {string} topic - for example: 'trigger.test.requested'
   * @returns {Promise<[activityId: string, activity: ActivityType]>}
   */
  async getActivity(topic: string): Promise<[activityId: string, activity: ActivityType]> {
    const app = await this.store.getApp(this.appId);
    if (app) {
      if (this.isPrivate(topic)) {
        const activityId = topic.substring(1)
        const activity = await this.store.getSchema(activityId, this.getAppConfig());
        return [activityId, activity];
      } else {
        const activityId = await this.store.getSubscription(topic, this.getAppConfig());
        if (activityId) {
          const activity = await this.store.getSchema(activityId, this.getAppConfig());
          return [activityId, activity];
        }
      }
      throw new Error(`no subscription found for topic ${topic} in app ${this.appId} for app version ${app.version}`);
    }
    throw new Error(`no app found for id ${this.appId}`);
  }

  /**
   * get the pubsubdb manifest
   */
  async getSettings(): Promise<PubSubDBSettings> {
    return await this.store.getSettings();
  }

  async plan(path: string) {
    const compiler = new CompilerService(this.store);
    return await compiler.plan(path);
  }

  async deploy(path: string) {
    const compiler = new CompilerService(this.store);
    return await compiler.deploy(path);
  }

  async activate(version: string) {
    const appConfig = this.getAppConfig();
    const compiler = new CompilerService(this.store);
    return await compiler.activate(appConfig.id, version);
  }

  /**
   * public interface to invoke an activity (trigger) by publishing an event to its topic
   * @param {string} topic - for example: 'trigger.test.requested'
   * @param {Promise<Record<string, unknown>>} data 
   */
  async pub(topic: string, data: Record<string, unknown>, context?: JobContext) {
    const [activityId, activity] = await this.getActivity(topic);
    const ActivityHandler = Activities[activity.type];
    if (ActivityHandler) {
      const utc = new Date().toISOString();
      const metadata: ActivityMetadata = {
        aid: activityId,
        atp: activity.type,
        stp: activity.subtype,
        ac: utc,
        au: utc
      };
      const activityHandler = new ActivityHandler(activity, data, metadata, this, context);
      await activityHandler.process();
    }
  }

  /**
   * subscribe to a topic as a read-only listener
   * 
   * @param topic
   * @param callback 
   */
  sub(topic: string, callback: (data: Record<string, any>) => void) {
    //This method represents the "secondary" subscription type and allows 
    //PubSubDB to be used as a standard fan-out event publisher with no
    //jobs, tracking or anything else...essentially a read-only mechanism
    //that allows callers to subscribe to events and receiving their payloads.

    //Declarative YAML app models represent the "primary" subscription type
    //and guarantee, one-time delivery of an event and its payload.
    //Activities can and do affect the state of the app as they react to events.
  }

  /**
   * return a job by its id
   * @param key 
   * @returns 
   */
  get(key: string) {
    return this.store.get(key, this.getAppConfig());
  }
}

export { PubSubDBService };
