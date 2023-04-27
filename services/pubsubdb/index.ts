import { ActivityMetadata, TriggerActivity } from '../../typedefs/activity';
import { JobContext } from '../../typedefs/job';
import {
  PubSubDBApps,
  PubSubDBConfig,
  PubSubDBManifest,
  PubSubDBSettings } from '../../typedefs/pubsubdb';
import { JobStatsInput, GetStatsOptions, IdsResponse, StatsResponse } from '../../typedefs/stats';
import { AdapterService } from '../adapter';
import { CompilerService } from '../compiler';
import { LoggerService, ILogger } from '../logger';
import { ReporterService as Reporter } from '../reporter';
import { KeyType, PSNS } from '../store/key';
import { StoreService } from '../store';
import Activities from './activities';
import { ActivityType } from './activities/activity';
import { ConductorMessage } from '../../typedefs/conductor';
import { SubscriptionCallback } from '../../typedefs/conductor';

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
  adapterService: AdapterService | null;
  logger: ILogger;
  guid: string;
  cacheMode: 'nocache' | 'cache' = 'cache';
  untilVersion: string | null = null;
  quorum: number | null = null;

  /**
   * every object persisted to the backend will be namespaced with this value
   * @param namespace 
   */
  verifyNamespace(namespace?: string) {
    if (!namespace) {
      this.namespace = PSNS;
    } else if (!namespace.match(/^[A-Za-z0-9-]+$/)) {
      throw new Error(`config.namespace [${namespace}] is invalid`);
    } else {
      this.namespace = namespace;
    }
  }

  /**
   * verifies that the app id is valid and not reserved (a)
   */
  verifyAppId(appId: string) {
    if (!appId?.match(/^[A-Za-z0-9-]+$/)) {
      throw new Error(`config.appId [${appId}] is invalid`);
    } else if (appId === 'a') {
      throw new Error(`config.appId [${appId}] is reserved`);
    } else {
      this.appId = appId;
    }
  }

  /**
   * Redis (ioredis and redis) serves as the reference implementation for the `store`
   * interface. However, the `store` interface is designed to be pluggable so that
   * other databases can be used as well. Subclass `StoreService` to implement.
   */
  async verifyStore(store: StoreService) {
    if (!(store instanceof StoreService)) {
      throw new Error(`store ${store} is invalid`);
    } else {
      this.store = store;
      this.apps = await this.store.init(this.namespace, this.appId, this.logger);
    }
  }

  /**
   * Initializes `pubsubdb` and its bound `store`. The `store` serves to hide the
   * low-level, native Redis commands and provides a higher-level API for
   * interacting with the database that is more suitable for modeling workflows.
   */
  static async init(config: PubSubDBConfig) {
    instance = new PubSubDBService();
    instance.logger = new LoggerService(config.logger);
    instance.verifyNamespace(config.namespace);
    instance.verifyAppId(config.appId);
    await instance.verifyStore(config.store);
    await instance.store.subscribe(
      KeyType.CONDUCTOR,
      instance.subscriptionHandler(),
      await instance.getAppConfig()
    );
    instance.guid = Math.floor(Math.random() * 100000000).toString();
    instance.adapterService = new AdapterService();
    return instance;
  }

  /**
   * Returns the app id and version to use when processing messages.
   */
  async getAppConfig() {
    if (this.cacheMode === 'nocache') {
      const app = await this.store.getApp(this.appId, true);
      if (app.version.toString() === this.untilVersion.toString()) {
        //new version is deployed; OK to cache again
        if (!this.apps) this.apps = {};
        this.apps[this.appId] = app;
        this.setCacheMode('cache', app.version.toString());
      }
      return { id: this.appId, version: app.version };
    } else {
      return { id: this.appId, version: this.apps![this.appId].version };
    }
  }

  /**
   * when possible, pubsubdb instances will attempt to cache the 
   * execution instructions for an app+version. Caching is disabled during
   * a version upgrade, and re-enabled once the new version is deployed.
   */
  setCacheMode(cacheMode: 'nocache' | 'cache', untilVersion: string) {
    this.logger.info(`setting mode to ${cacheMode}`);
    this.cacheMode = cacheMode;
    this.untilVersion = untilVersion;
  }
  
  /**
   * Returns a scoped callback handler for processing subscription messages.
   * Redis subscription messages are used to coordinate fleet behavior, particularly
   * during new version activation.
   */
  subscriptionHandler(): SubscriptionCallback {
    const self = this;
    return async (topic: string, message: ConductorMessage) => {
      self.logger.debug(`subscriptionHandler: ${topic} ${JSON.stringify(message)}`);
      if (message.type === 'activate') {
        self.setCacheMode(message.cache_mode, message.until_version);
      } else if (message.type === 'ping') {
        self.store.publish(KeyType.CONDUCTOR, { type: 'pong', guid: self.guid, originator: message.originator }, await this.getAppConfig());
      } else if (message.type === 'pong') {
        if (self.guid === message.originator) {
          //the originator counts the quorum
          self.quorum = self.quorum + 1;
        }
      }
    };
  }

  /**
   * resets the quorum count and returns the prior count
   */
  async requestQuorum(): Promise<number> {
    const quorum = this.quorum;
    this.quorum = 0;
    await this.store.publish(KeyType.CONDUCTOR, { type: 'ping', originator: this.guid }, await this.getAppConfig())
    await new Promise(resolve => setTimeout(resolve, 25));
    return quorum;
  };



  // ************* METADATA/MODEL METHODS *************
  async initActivity(topic: string, data: Record<string, unknown>, context?: JobContext): Promise<any> {
    if (!data) {
      throw new Error(`payload data is required and must be an object`);
    }
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
      return new ActivityHandler(activity, data, metadata, this, context);
    } else {
      throw new Error(`activity type ${activity.type} not found`);
    }
  }
  async getActivity(topic: string): Promise<[activityId: string, activity: ActivityType]> {
    const app = await this.store.getApp(this.appId);
    if (app) {
      if (this.isPrivate(topic)) {
        //private subscriptions use the activity id (.activityId)
        const activityId = topic.substring(1)
        const activity = await this.store.getSchema(activityId, await this.getAppConfig());
        return [activityId, activity];
      } else {
        //public subscriptions use a topic (a.b.c) that is associated with an activity id
        const activityId = await this.store.getSubscription(topic, await this.getAppConfig());
        if (activityId) {
          const activity = await this.store.getSchema(activityId, await this.getAppConfig());
          return [activityId, activity];
        }
      }
      throw new Error(`no subscription found for topic ${topic} in app ${this.appId} for app version ${app.version}`);
    }
    throw new Error(`no app found for id ${this.appId}`);
  }
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
    version = version.toString();
    const config = await this.getAppConfig();
    //request a quorum (there is no controller to coordinate, so we'll serve as chairperson)
    await this.requestQuorum();
    const q1 = await this.requestQuorum();
    const q2 = await this.requestQuorum();
    const q3 = await this.requestQuorum();
    this.logger.info(`Quorum Roll Call Results: q1: ${q1}, q2: ${q2}, q3: ${q3}`);
    if (q1 && q1 === q2 && q2 === q3) {
      this.store.publish(KeyType.CONDUCTOR, { type: 'activate', cache_mode: 'nocache', until_version: version }, await this.getAppConfig())
      await new Promise(resolve => setTimeout(resolve, 25));
      //confirm we received the activation message
      if (this.untilVersion === version) {
        this.logger.info(`Quorum reached. Activating version ${this.untilVersion}`);
        const { id } = config;
        const compiler = new CompilerService(this.store, this.logger);
        return await compiler.activate(id, version);
      } else {
        this.logger.error(`Quorum NOT reached. Current version will remain ${this.untilVersion}`);
        this.store.publish(KeyType.CONDUCTOR, { type: 'activate', cache_mode: 'cache', until_version: version }, await this.getAppConfig())
        throw new Error(`unable to activate version ${version}. Current version will remain ${this.untilVersion}`);
      }
    } else {
      throw new Error(`unable to activate version ${version}. Quorum failed. Current version will remain ${this.untilVersion}`);
    }
  }



  // ************* REPORTER METHODS *************
  async getStats(topic: string, inputs: JobStatsInput): Promise<StatsResponse> {
    const { id, version } = await this.getAppConfig();
    const reporter = new Reporter(id, version, this.store, this.logger);
    const options = await this.createOptions(topic, inputs);
    return await reporter.getStats(options);
  }
  async getIds(topic: string, inputs: JobStatsInput, facets = []): Promise<IdsResponse> {
    const { id, version } = await this.getAppConfig();
    const reporter = new Reporter(id, version, this.store, this.logger);
    const options = await this.createOptions(topic, inputs);
    return await reporter.getIds(options, facets);
  }
  async createOptions(topic: string, inputs: JobStatsInput): Promise<GetStatsOptions> {
    //convert user-provided data into the job key, etc
    const trigger = await this.initActivity(topic, inputs.data);
    await trigger.createContext();
    return {
      end: inputs.end,
      start: inputs.start,
      range: inputs.range,
      granularity: trigger.resolveGranularity(topic),
      key: trigger.resolveJobKey(topic)
    } as GetStatsOptions;
  }



  // ********************** TODO: BATCH.PUB METHODS ***********************
  //expose batch method: <this>.pub(topic, data, context)
  //   this targets a specific jobkey+dateTimeSlice
  //   it is a "job" where the queue is the jobkey+dateTimeSlice:index
  //   iterate through each item, pulling the jobkey+dateTimeSlice:index
  //   and then publishing the payload to the topic for each individual item



  // ************************** PUB/SUB METHODS **************************
  async pub(topic: string, data: Record<string, unknown>, context?: JobContext) {
    const activityHandler = await this.initActivity(topic, data, context);
    if (activityHandler) {
      return await activityHandler.process();
    } else {
      throw new Error(`unable to process activity for topic ${topic}`);
    }
  }
  sub(topic: string, callback: (data: Record<string, any>) => void) {
    //local, ephemeral subscription
  }



  // ***************** STORE METHODS (ACTIVITY/JOB DATA) *****************
  /**
   * return a job by its id
   */
  async get(key: string) {
    return this.store.get(key, await this.getAppConfig());
  }

  static stop(config: Record<string, string|number|boolean>) {
    //disable db access (read? readwrite? write?)
  }

  async start(config: Record<string, string|number|boolean>) {
    //enable db access (read? readwrite? write?)
  }
}

export { PubSubDBService };
