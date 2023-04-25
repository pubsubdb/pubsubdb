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

  /**
   * Initializes `pubsubdb` and its `store`. The `store` is critical as it
   * represents a common API layer between the pubsubdb client and the redis backend;
   * It surfaces the low-level redis commands ('hget', 'set') with domain-specific
   * constructs like 'app', 'activity', and 'job'.
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
   * The BE server (Redis) stores all state, including all application metadata
   * and execution instructions. In order to run at scale, the client must
   * resolve the app version and then cache the execution instructions for that version.
   * By doing so, only data is ever sent over the wire in a typical read/write exchange.
   * This obviously scales well, but it also allows the client to get out of step
   * and run a stale version. As part of the lifecycle to prevent this, the client can
   * temporarily run in a 'nocache' mode, which will force the client to confirm the
   * app version before executing any instructions. This is a minor delay as it is
   * a read operation against Redis.
   *
   * When a message published to the topic `psdb:${appId}::conductor`,
   * and it has the payload {type:'activate', cache_mode:'nocache|cache' until_version:string},
   * it triggers all connected PubSubDB clients to run in 'nocache' mode. (It means
   * a new version is about to be activated.)
   *
   * At this point in the process, the new version will already be deployed to the
   * BE server, but the the `app` version flag will not yet be updated to use it. Once the
   * message is published to run in `nocache` mode, the version to use will be updated
   * on the BE. Every connected client will be running in nocache mode and will pick
   * up the change on their very next call to the BE.
   * 
   * The moment a client returns an app version with this expected value, it will lock
   * the version locally as the version to use and cease running in 'nocache' mode. From
   * this point forward all clients will use a cached instance of the app schema
   * and execution instructions for the new version. The entire operation is stateless
   * yet coordinated without requiring a shutdown to ensure the singular version.
   *
   * TODO: Run a 3-part ping/pong exchange to verify a full quorum of clients given
   *       the stateless nature of the system. If all three runs produce the exact
   *       same client count, then all clients are in a "healthy" state and
   *       able to respond to the about-to-be-issued-upgrade-request. If not, then
   *       the system will throw a 'busy...' error and the caller can try again.
   *       The event will use the same `psdb:${appId}::schedule` topic
   *       but the payload will be {type:'ping'}. Clients are expected
   *       to respond with {type:'pong', guid:string} on the same topic.
   * 
   * @returns
   */
  async getAppConfig() {
    if (this.cacheMode === 'nocache') {
      const app = await this.store.getApp(this.appId, true);
      if (app.version.toString() === this.untilVersion.toString()) {
        //new version is deployed; cache execution instructions
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
   * Returns scoped callback handler function for the subscription channel
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
          //count the pong responses (we originated the ping)
          self.quorum = self.quorum + 1;
        }
      }
    };
  }

  /**
   * resets the quorum count and returns the prior count
   * @returns 
   */
  async requestQuorum() {
    const quorum = this.quorum;
    this.quorum = 0;
    await this.store.publish(KeyType.CONDUCTOR, { type: 'ping', originator: this.guid }, await this.getAppConfig())
    await new Promise(resolve => setTimeout(resolve, 25));
    return quorum;
  };

  /**
   * pubsubdb instances cache their execution instructions for their target app/version;
   * this method will toggle the cache mode to force the instance to confirm
   * which version of the app to use before executing any isntructions.
   * @param cacheMode
   */
  setCacheMode(cacheMode: 'nocache' | 'cache', untilVersion: string) {
    this.logger.info(`setting mode to ${cacheMode}`);
    this.cacheMode = cacheMode;
    this.untilVersion = untilVersion;
  }


  // ************* METADATA/MODEL METHODS *************
  /**
   * returns a tuple with the activity [id, schema] when provided a subscription topic
   * todo: check `hooks` first for topic and then resolve using `signals` table
   * @param {string} topic - for example: 'trigger.test.requested' OR '.a1'
   * @returns {Promise<[activityId: string, activity: ActivityType]>}
   */
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
  async getStats(options: GetStatsOptions): Promise<StatsResponse> {
    const { id, version } = await this.getAppConfig();
    const reporter = new Reporter(id, version, this.store, this.logger);
    return await reporter.getStats(options);
  }



  // ************* TODO: BATCH.PUB METHODS *************
  //expose batch method: <this>.pub(topic, data, context)
  //   this targets a specific jobkey+dateTimeSlice
  //   it is a "job" where the queue is the jobkey+dateTimeSlice:index
  //   iterate through each item, pulling the jobkey+dateTimeSlice:index
  //   and then publishing the payload to the topic for each individual item



  // ************* PUB/SUB METHODS *************
  /**
   * trigger a job by publishing a payload to its assigned topic
   * @param {string} topic - for example: 'trigger.test.requested'
   * @param {Promise<Record<string, unknown>>} data
   * @param {JobContext} context
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
    //jobs, tracking or anything else...essentially a read-only mechanism
    //to be alerted when events happen on the server.
  }



  // ************* STORE METHODS (ACTIVITY/JOB DATA) *************
  /**
   * return a job by its id
   * @param key 
   * @returns 
   */
  async get(key: string) {
    return this.store.get(key, await this.getAppConfig());
  }

  static stop(config: Record<string, string|number|boolean>) {
    //shut down the entire system (every write call is disabled)
    //todo: topic based, filter? allow read, read/write, etc
  }

  async start(config: Record<string, string|number|boolean>) {
    //start up again (todo: a portion? read only? readwrite?)
  }
}

export { PubSubDBService };
