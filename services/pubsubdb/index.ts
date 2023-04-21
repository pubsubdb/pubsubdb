import { ActivityMetadata } from '../../typedefs/activity';
import { JobContext } from '../../typedefs/job';
import {
  PubSubDBApps,
  PubSubDBConfig,
  PubSubDBManifest,
  PubSubDBSettings } from '../../typedefs/pubsubdb';
import { GetStatsOptions, StatsResponse } from '../../typedefs/stats';
import { AdapterService } from '../adapter';
import { CompilerService } from '../compiler';
import { LoggerService, ILogger } from '../logger';
import { ReporterService as Reporter } from '../reporter';
import { PSNS } from '../store/keyStore';
import { StoreService } from '../store/store';
import Activities from './activities';
import { ActivityType } from './activities/activity';

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
  logger: ILogger;

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

  verifyNamespace(namespace?: string) {
    if (!namespace) {
      this.namespace = PSNS;
    } else if (!namespace.match(/^[A-Za-z0-9-]+$/)) {
      throw new Error(`config.namespace [${namespace}] is invalid`);
    } else {
      this.namespace = namespace;
    }
  }

  verifyAppId(appId: string) {
    if (!appId?.match(/^[A-Za-z0-9-]+$/)) {
      throw new Error(`config.appId [${appId}] is invalid`);
    } else if (appId === 'a') {
      throw new Error(`config.appId [${appId}] is reserved`);
    } else {
      this.appId = appId;
    }
  }

  async verifyStore(store: StoreService) {
    if (!(store instanceof StoreService)) {
      throw new Error(`store ${store} is invalid`);
    } else {
      this.store = store;
      this.apps = await this.store.init(this.namespace, this.appId, this.logger);
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
    instance.logger = new LoggerService(config.logger);
    instance.verifyNamespace(config.namespace);
    instance.verifyAppId(config.appId);
    await instance.verifyStore(config.store);
    instance.cluster = config.cluster || false;
    instance.adapterService = new AdapterService();
    return instance;
  }


  // ************* METADATA/MODEL METHODS *************
  /**
   * returns a tuple with the activity [id, schema] when provided a subscription topic
   * @param {string} topic - for example: 'trigger.test.requested' OR '.a1'
   * @returns {Promise<[activityId: string, activity: ActivityType]>}
   */
  async getActivity(topic: string): Promise<[activityId: string, activity: ActivityType]> {
    const app = await this.store.getApp(this.appId);
    if (app) {
      if (this.isPrivate(topic)) {
        //private subscriptions use the activity id (.activityId)
        const activityId = topic.substring(1)
        const activity = await this.store.getSchema(activityId, this.getAppConfig());
        return [activityId, activity];
      } else {
        //public subscriptions use a topic (a.b.c) that is associated with an activity id
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
  isPrivate(topic: string) {
    return topic.startsWith('.');
  }



  // ************* COMPILER METHODS *************
  async plan(path: string): Promise<PubSubDBManifest> {
    const compiler = new CompilerService(this.store, this.logger);
    return await compiler.plan(path);
  }
  async deploy(path: string): Promise<PubSubDBManifest> {
    const compiler = new CompilerService(this.store, this.logger);
    return await compiler.deploy(path);
  }
  async activate(version: string) {
    const { id } = this.getAppConfig();
    const compiler = new CompilerService(this.store, this.logger);
    return await compiler.activate(id, version);
  }



  // ************* REPORTER METHODS *************
  async getStats(options: GetStatsOptions): Promise<StatsResponse> {
    const { id, version } = this.getAppConfig();
    const reporter = new Reporter(id, version, this.store, this.logger);
    return await reporter.getStats(options);
  }



  // ************* PUB/SUB METHODS *************
  /**
   * trigger a job by publishing a payload to its assigned topic
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
      return await activityHandler.process();
    }
  }
  /**
   * subscribe to a topic as a read-only listener
   * 
   * @param topic
   * @param callback 
   */
  sub(topic: string, callback: (data: Record<string, any>) => void) {
    //Declarative YAML app models represent the "primary" subscription type.
    //This method represents the "secondary" subscription type and allows 
    //PubSubDB to be used as a standard fan-out event publisher with no
    //jobs, tracking or anything else...essentially a read-only mechanism.
  }



  // ************* STORE METHODS (ACTIVITY/JOB DATA) *************
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
