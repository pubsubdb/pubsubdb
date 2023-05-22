import { getSubscriptionTopic, getGuid } from '../../modules/utils';
import { CollatorService } from '../collator';
import { CompilerService } from '../compiler';
import { LoggerService, ILogger } from '../logger';
import { ReporterService as Reporter } from '../reporter';
import { SignalerService } from '../signaler';
import { StoreService } from '../store';
import { KeyType, PSNS } from '../store/key';
import { WorkerService } from '../worker';
import Activities from './activities';
import { Activity, ActivityType } from './activities/activity';
import { Await } from './activities/await';
import { Exec } from './activities/exec';
import { Trigger } from './activities/trigger';
import { ActivityMetadata } from '../../typedefs/activity';
import { ConductorMessage, SubscriptionCallback } from '../../typedefs/conductor';
import { JobContext, JobData, MinimumInitialJobContext } from '../../typedefs/job';
import {
  PubSubDBApps,
  PubSubDBConfig,
  PubSubDBManifest,
  PubSubDBSettings } from '../../typedefs/pubsubdb';
import {
  JobStatsInput,
  GetStatsOptions,
  IdsResponse,
  StatsResponse } from '../../typedefs/stats';
import { AppVersion } from '../../typedefs/app';
import { RedisClient, RedisMulti } from '../../typedefs/store';
import { StreamDataResponse } from '../../typedefs/stream';

//todo: can be multiple instances; track as a Map
let instance: PubSubDBService;

//wait time to see if quorum is reached
const QUORUM_DELAY = 250;

class PubSubDBService {
  namespace: string;
  appId: string;
  store: StoreService<RedisClient, RedisMulti> | null;
  apps: PubSubDBApps | null;
  signaler: SignalerService | null;
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

  async verifyStore(store: StoreService<RedisClient, RedisMulti>): Promise<AppVersion> {
    if (!(store instanceof StoreService)) {
      throw new Error(`store ${store} is invalid`);
    } else {
      this.store = store;
      this.apps = await this.store.init(this.namespace, this.appId, this.logger);
      return { id: this.appId, version: this.apps[this.appId].version};
    }
  }

  registerAdapters({ adapters }: PubSubDBConfig) {
    adapters?.forEach((adapter) => {
      if (adapter.topic && adapter.callback) {
        const key = this.store?.mintKey(KeyType.STREAMS, { appId: this.appId, topic: adapter.topic });
        this.signaler.consumeMessages(key, 'ADAPTER', this.guid, adapter.callback);
      }
    });
  }

  registerEngine() {
    const key = this.store?.mintKey(KeyType.STREAMS, { appId: this.appId });
    this.signaler.consumeMessages(key, 'ENGINE', this.guid, this.routeAdapterResponse.bind(this));
  }

  /**
   * Entry point. Once called, every method is available for use.
   */
  static async init(config: PubSubDBConfig) {
    instance = new PubSubDBService();
    instance.logger = new LoggerService(config.logger);
    instance.verifyNamespace(config.namespace);
    instance.verifyAppId(config.appId);
    const appConfig = await instance.verifyStore(config.store);
    await instance.store.subscribe(
      KeyType.CONDUCTOR,
      instance.subscriptionHandler(),
      appConfig
    );
    instance.guid = getGuid();
    instance.signaler = new SignalerService(
      appConfig,
      instance.store,
      instance.logger,
      instance
    );
    instance.registerEngine();
    instance.registerAdapters(config);
    instance.processWorkItems();
    return instance;
  }

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
      return { id: this.appId, version: this.apps?.[this.appId].version };
    }
  }

  setCacheMode(cacheMode: 'nocache' | 'cache', untilVersion: string) {
    this.logger.info(`setting mode to ${cacheMode}`);
    this.cacheMode = cacheMode;
    this.untilVersion = untilVersion;
  }
  
  /**
   * Returns a scoped callback handler for processing subscription messages.
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
          self.quorum = self.quorum + 1;
        }
      } else if (message.type === 'work') {
        self.processWorkItems()
      }
    };
  }

  async processWorkItems() {
    const { id, version } = await this.getAppConfig();
    const worker = new WorkerService({ id, version }, this, this.store, this.logger);
    worker.processWorkItems();
  }

  async requestQuorum(): Promise<number> {
    const quorum = this.quorum;
    this.quorum = 0;
    await this.store.publish(KeyType.CONDUCTOR, { type: 'ping', originator: this.guid }, await this.getAppConfig())
    await new Promise(resolve => setTimeout(resolve, QUORUM_DELAY));
    return quorum;
  }


  // ************* METADATA/MODEL METHODS *************
  async initActivity(topic: string, data: JobData, context?: JobContext): Promise<Activity> {
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
      const hook = null;
      return new ActivityHandler(activity, data, metadata, hook, this, context);
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
    //request a quorum to activate the version
    await this.requestQuorum();
    const q1 = await this.requestQuorum();
    const q2 = await this.requestQuorum();
    const q3 = await this.requestQuorum();
    this.logger.info(`Quorum Roll Call Results: q1: ${q1}, q2: ${q2}, q3: ${q3}`);
    if (q1 && q1 === q2 && q2 === q3) {
      this.store.publish(
        KeyType.CONDUCTOR,
        { type: 'activate', cache_mode: 'nocache', until_version: version },
        await this.getAppConfig()
      );
      await new Promise(resolve => setTimeout(resolve, QUORUM_DELAY));
      //confirm we received the activation message
      if (this.untilVersion === version) {
        this.logger.info(`Quorum reached. Activating version ${this.untilVersion}`);
        const { id } = config;
        const compiler = new CompilerService(this.store, this.logger);
        return await compiler.activate(id, version);
      } else {
        this.logger.error(`Quorum NOT reached to activate ${version}.`);
        throw new Error(`UntilVersion Not Received. Version ${version} not activated`);
      }
    } else {
      throw new Error(`Quorum not reached. Version ${version} not activated.`);
    }
  }


  // ************* REPORTER METHODS *************
  async getStats(topic: string, query: JobStatsInput): Promise<StatsResponse> {
    const { id, version } = await this.getAppConfig();
    const reporter = new Reporter({ id, version }, this.store, this.logger);
    const resolvedQuery = await this.resolveQuery(topic, query);
    return await reporter.getStats(resolvedQuery);
  }
  async getIds(topic: string, query: JobStatsInput, queryFacets = []): Promise<IdsResponse> {
    const { id, version } = await this.getAppConfig();
    const reporter = new Reporter({ id, version }, this.store, this.logger);
    const resolvedQuery = await this.resolveQuery(topic, query);
    return await reporter.getIds(resolvedQuery, queryFacets);
  }
  async resolveQuery(topic: string, query: JobStatsInput): Promise<GetStatsOptions> {
    const trigger = await this.initActivity(topic, query.data) as Trigger;
    await trigger.createContext();
    return {
      end: query.end,
      start: query.start,
      range: query.range,
      granularity: trigger.resolveGranularity(),
      key: trigger.resolveJobKey(trigger.createInputContext()),
      sparse: query.sparse,
    } as GetStatsOptions;
  }


  // ********************** XSTREAM/RESOLVE METHOD ***********************
  async routeAdapterResponse(streamData: StreamDataResponse): Promise<void> {
    const context: MinimumInitialJobContext = {
      metadata: {
        jid: streamData.metadata.jid,
        aid: streamData.metadata.aid,
      },
      data: streamData.data,
    };
    const activityHandler = await this.initActivity(`.${streamData.metadata.aid}`, context.data, context as JobContext) as Exec;
    //return void; it is a signal to the
    await activityHandler.processAdapterResponse(streamData.status);
  }


  // ********************** ASYNC/RESOLVE METHODS ***********************
  hasParentJob(context: JobContext): boolean {
    return Boolean(context.metadata.pj && context.metadata.pa);
  }
  async transitionJob(context: JobContext, toDecrement: number): Promise<void> {
    if (toDecrement) {
      const activityStatus = await this.store.updateJobStatus(
        context.metadata.jid,
        toDecrement,
        await this.getAppConfig()
      );
      if (CollatorService.isJobComplete(activityStatus) && this.hasParentJob(context)) {
        await this.resolveAwait(context); //todo: add job to a 'completed' worker list
      }
    }
  }
  async resolveAwait(context: JobContext) {
    if (this.hasParentJob(context)) {
      const completedJobId = context.metadata.jid;
      const config = await this.getAppConfig();
      const parentContext: Partial<JobContext> = {
        data: await this.store.getJob(completedJobId, config),
        metadata: { 
          ...context.metadata,
          jid: context.metadata.pj,
          aid: context.metadata.pa,
          pj: undefined,
          pa: undefined,
        }
      };
      const activityHandler = await this.initActivity(`.${parentContext.metadata.aid}`, parentContext.data, parentContext as JobContext) as Await;
      return await activityHandler.resolveAwait();
    }
  }


  // ********************** SIGNAL/HOOK METHODS ***********************
  async hook(topic: string, data: JobData) {
    const hookRule = await this.signaler.getHookRule(topic);
    if (hookRule) {
      const activityHandler = await this.initActivity(`.${hookRule.to}`, data);
      return await activityHandler.processHookSignal();
    } else {
      throw new Error(`unable to process hook for topic ${topic}`);
    }
  }
  async hookAll(hookTopic: string, data: JobData, query: JobStatsInput, queryFacets: string[] = []): Promise<string[]> {
    const { id, version } = await this.getAppConfig();
    const hookRule = await this.signaler.getHookRule(hookTopic);
    if (hookRule) {
      const subscriptionTopic = await getSubscriptionTopic(hookRule.to, this.store, { id, version })
      const resolvedQuery = await this.resolveQuery(subscriptionTopic, query);
      const reporter = new Reporter({ id, version }, this.store, this.logger);
      const workItems = await reporter.getWorkItems(resolvedQuery, queryFacets);
      const workerService = new WorkerService({ id, version}, this, this.store, this.logger);
      await workerService.enqueueWorkItems(
        workItems.map(
          workItem => `${hookTopic}::${workItem}::${JSON.stringify(data)}`
      ));
      this.store.publish(
        KeyType.CONDUCTOR,
        { type: 'work', originator: this.guid },
        { id, version }
      );
      return workItems;
    } else {
      throw new Error(`unable to find hook for topic ${hookTopic}`);
    }
  }


  // ************************** PUB/SUB METHODS **************************
  async pub(topic: string, data: JobData, context?: JobContext) {
    const activityHandler = await this.initActivity(topic, data, context);
    if (activityHandler) {
      return await activityHandler.process();
    } else {
      throw new Error(`unable to process activity for topic ${topic}`);
    }
  }
  sub(topic: string, callback: (data: Record<string, any>) => void) {
  }


  // ***************** STORE METHODS (ACTIVITY/JOB DATA) *****************
  async get(key: string) {
    //get job by id
    return this.store.getJob(key, await this.getAppConfig());
  }
}

export { PubSubDBService };
