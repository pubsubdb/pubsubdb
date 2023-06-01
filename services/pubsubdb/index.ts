import { KeyType, PSNS } from '../../modules/key';
import { getSubscriptionTopic, getGuid, sleepFor } from '../../modules/utils';
import { CollatorService } from '../collator';
import { CompilerService } from '../compiler';
import { LoggerService, ILogger } from '../logger';
import { ReporterService as Reporter } from '../reporter';
import { StoreSignaler } from '../signaler/store';
import { StreamSignaler } from '../signaler/stream';
import { StoreService } from '../store';
import { StreamService } from '../stream';
import { SubService } from '../sub';
import { WorkerService } from '../worker';
import Activities from './activities';
import { Activity } from './activities/activity';
import { Await } from './activities/await';
import { Exec } from './activities/exec';
import { Trigger } from './activities/trigger';
import { ActivityMetadata, ActivityType } from '../../typedefs/activity';
import { AppVersion } from '../../typedefs/app';
import {
  ConductorMessage,
  JobMessage,
  JobMessageCallback,
  SubscriptionCallback } from '../../typedefs/conductor';
import {
  JobActivityContext,
  JobData,
  JobOutput,
  PartialJobContext } from '../../typedefs/job';
import {
  PubSubDBApps,
  PubSubDBConfig,
  PubSubDBManifest,
  PubSubDBSettings } from '../../typedefs/pubsubdb';
import { RedisClient, RedisMulti } from '../../typedefs/redis';
import {
  JobStatsInput,
  GetStatsOptions,
  IdsResponse,
  StatsResponse } from '../../typedefs/stats';
import { StreamDataResponse } from '../../typedefs/stream';

let instance: PubSubDBService;

//wait time to see if quorum is reached
const QUORUM_DELAY = 250;

//wait time to see if a job is complete
const OTT_WAIT_TIME = 1000;

class PubSubDBService {
  namespace: string;
  apps: PubSubDBApps | null;
  appId: string;
  guid: string;
  store: StoreService<RedisClient, RedisMulti> | null;
  stream: StreamService<RedisClient, RedisMulti> | null;
  subscribe: SubService<RedisClient, RedisMulti> | null;
  storeSignaler: StoreSignaler | null;
  streamSignaler: StreamSignaler | null;
  logger: ILogger;
  cacheMode: 'nocache' | 'cache' = 'cache';
  untilVersion: string | null = null;
  quorum: number | null = null;
  jobCallbacks: Record<string, JobMessageCallback> = {};

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

  verifyEngineFields(config: PubSubDBConfig) {
    if (!(config.engine.store instanceof StoreService) || 
      !(config.engine.stream instanceof StreamService) ||
      !(config.engine.sub instanceof SubService)) {
      throw new Error('engine config must include `store`, `stream`, and `sub` fields.');
    }
  }

  async registerEngine(config: PubSubDBConfig): Promise<AppVersion> {
    if (config.engine) {
      this.verifyEngineFields(config);
      this.store = config.engine.store;
      this.stream = config.engine.stream;
      this.subscribe = config.engine.sub;
      //initialize the `store` client for read/write data access
      this.apps = await this.store.init(this.namespace, this.appId, this.logger);
      const appConfig = await this.getAppConfig();
      //initialize the `sub` client (will wire-up all subscriptions needed by the engine)
      await this.subscribe.init(this.namespace, this.appId, this.guid, this.logger, this.subscriptionHandler());
      //initialize the `stream` client and signaler to get buffered tasks
      this.stream.init(this.namespace, this.appId, this.logger);
      const key = this.stream.mintKey(KeyType.STREAMS, { appId: this.appId });
      this.streamSignaler = new StreamSignaler(this.appId, this.stream, this.store, this.logger);
      this.streamSignaler.consumeMessages(key, 'ENGINE', this.guid, this.processWorkerResponse.bind(this));
      //bind handler that processes external signals (webhooks) from outside callers
      this.storeSignaler = new StoreSignaler(appConfig, this);
      //chip away at any outstanding `quorum tasks` (like `hookAll`, `garbage collection`, etc.)
      this.processWorkItems();
      return appConfig;
    }
  }

  registerWorkers({ workers }: PubSubDBConfig) {
    workers?.forEach((worker) => {
      if (worker.topic && worker.callback && worker.stream) {
        worker.stream.init(this.namespace, this.appId, this.logger);
        const key = worker.stream.mintKey(KeyType.STREAMS, { appId: this.appId, topic: worker.topic });
        worker.streamSignaler = new StreamSignaler(this.appId, worker.stream, worker.store, this.logger);
        worker.streamSignaler.consumeMessages(key, 'WORKER', this.guid, worker.callback);
      }
    });
  }

  /**
   * Entry point. Once called, every method is available for use.
   */
  static async init(config: PubSubDBConfig) {
    instance = new PubSubDBService();
    instance.logger = new LoggerService(config.logger);
    instance.verifyNamespace(config.namespace);
    instance.verifyAppId(config.appId);
    instance.guid = getGuid();
    await instance.registerEngine(config);
    instance.registerWorkers(config);
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
        self.store.publish(KeyType.CONDUCTOR, { type: 'pong', guid: self.guid, originator: message.originator }, this.appId);
      } else if (message.type === 'pong') {
        if (self.guid === message.originator) {
          self.quorum = self.quorum + 1;
        }
      } else if (message.type === 'work') {
        self.processWorkItems()
      } else if (message.type === 'job') {
        self.routeToSubscribers(message.topic, message.job)
      }
    };
  }

  async routeToSubscribers(topic: string, message: JobOutput) {
    const jobCallback = this.jobCallbacks[message.metadata.jid];
    if (jobCallback) {
      this.delistJobCallback(message.metadata.jid);
      jobCallback(topic, message);
    }
  }

  async processWorkItems() {
    const { id, version } = await this.getAppConfig();
    const worker = new WorkerService({ id, version }, this, this.store, this.logger);
    worker.processWorkItems();
  }

  async requestQuorum(): Promise<number> {
    const quorum = this.quorum;
    this.quorum = 0;
    await this.store.publish(KeyType.CONDUCTOR, { type: 'ping', originator: this.guid }, this.appId);
    await sleepFor(QUORUM_DELAY);
    return quorum;
  }


  // ************* METADATA/MODEL METHODS *************
  async initActivity(topic: string, data: JobData, context?: JobActivityContext): Promise<Activity> {
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
        this.appId
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


  // ****************** `EXEC` ACTIVITY RE-ENTRY POINT *****************
  async processWorkerResponse(streamData: StreamDataResponse): Promise<void> {
    const context: PartialJobContext = {
      metadata: {
        jid: streamData.metadata.jid,
        aid: streamData.metadata.aid,
      },
      data: streamData.data,
    };
    const activityHandler = await this.initActivity(`.${streamData.metadata.aid}`, context.data, context as JobActivityContext) as Exec;
    //return void; it is a signal to the
    await activityHandler.processWorkerResponse(streamData.status);
  }


  // ***************** `ASYNC` ACTIVITY RE-ENTRY POINT ****************
  hasParentJob(context: JobActivityContext): boolean {
    return Boolean(context.metadata.pj && context.metadata.pa);
  }
  async resolveAwait(context: JobActivityContext) {
    if (this.hasParentJob(context)) {
      const completedJobId = context.metadata.jid;
      const config = await this.getAppConfig();
      const parentContext: Partial<JobActivityContext> = {
        data: await this.store.getJob(completedJobId, config),
        metadata: { 
          ...context.metadata,
          jid: context.metadata.pj,
          aid: context.metadata.pa,
          pj: undefined,
          pa: undefined,
        }
      };
      const activityHandler = await this.initActivity(`.${parentContext.metadata.aid}`, parentContext.data, parentContext as JobActivityContext) as Await;
      return await activityHandler.resolveAwait();
    }
  }


  // ****************** `HOOK` ACTIVITY RE-ENTRY POINT *****************
  async hook(topic: string, data: JobData) {
    const hookRule = await this.storeSignaler.getHookRule(topic);
    if (hookRule) {
      const activityHandler = await this.initActivity(`.${hookRule.to}`, data);
      return await activityHandler.processHookSignal();
    } else {
      throw new Error(`unable to process hook for topic ${topic}`);
    }
  }
  async hookAll(hookTopic: string, data: JobData, query: JobStatsInput, queryFacets: string[] = []): Promise<string[]> {
    const config = await this.getAppConfig();
    const hookRule = await this.storeSignaler.getHookRule(hookTopic);
    if (hookRule) {
      const subscriptionTopic = await getSubscriptionTopic(hookRule.to, this.store, config)
      const resolvedQuery = await this.resolveQuery(subscriptionTopic, query);
      const reporter = new Reporter(config, this.store, this.logger);
      const workItems = await reporter.getWorkItems(resolvedQuery, queryFacets);
      const workerService = new WorkerService(config, this, this.store, this.logger);
      await workerService.enqueueWorkItems(
        workItems.map(
          workItem => `${hookTopic}::${workItem}::${JSON.stringify(data)}`
      ));
      this.store.publish(
        KeyType.CONDUCTOR,
        { type: 'work', originator: this.guid },
        this.appId
      );
      return workItems;
    } else {
      throw new Error(`unable to find hook for topic ${hookTopic}`);
    }
  }


  // ********************** PUB/SUB ENTRY POINT **********************
  //publish (returns just the job id)
  async pub(topic: string, data: JobData, context?: JobActivityContext) {
    const activityHandler = await this.initActivity(topic, data, context);
    if (activityHandler) {
      return await activityHandler.process();
    } else {
      throw new Error(`unable to process activity for topic ${topic}`);
    }
  }
  //subscribe to all jobs for a topic
  async sub(topic: string, callback: JobMessageCallback): Promise<void> {
    const subscriptionCallback: SubscriptionCallback = async (topic: string, message: {topic: string, job: JobOutput}) => {
      callback(message.topic, message.job);
    };
    return await this.subscribe.subscribe(KeyType.CONDUCTOR, subscriptionCallback, this.appId, topic);
  }
  //unsubscribe to all jobs for a topic
  async unsub(topic: string): Promise<void> {
    return await this.subscribe.unsubscribe(KeyType.CONDUCTOR, this.appId, topic);
  }
  //publish and await (returns the job and data (if ready)); throws error with jobid if not
  async pubsub(topic: string, data: JobData, timeout = OTT_WAIT_TIME): Promise<JobOutput> {
    const context = { metadata: { ngn: this.guid } } as JobActivityContext;
    const jobId = await this.pub(topic, data, context);
    return new Promise((resolve, reject) => {
      this.registerJobCallback(jobId, (topic: string, output: JobOutput) => {
        resolve(output);
      });
      setTimeout(() => {
        this.delistJobCallback(jobId);
        reject({
          status: 'error',
          type: 'timeout',
          id: jobId,
        });
      }, timeout);
    });
  }
  async resolveOneTimeSubscription(context: JobActivityContext) {
    if (this.hasOneTimeSubscription(context)) {
      const config = await this.getAppConfig();
      const jobOutput = await this.store.getJobOutput(context.metadata.jid, config);
      const message: JobMessage = {
        type: 'job',
        topic: context.metadata.jid,
        job: jobOutput,
      };
      this.store.publish(KeyType.CONDUCTOR, message, this.appId, context.metadata.ngn);
    }
  }
  async resolvePersistentSubscriptions(context: JobActivityContext) {
    const config = await this.getAppConfig();
    const schema = await this.store.getSchema(context.metadata.aid, config);
    const topic = schema.publishes;
    if (topic) {
      const jobOutput = await this.store.getJobOutput(context.metadata.jid, config);
      const message: JobMessage = {
        type: 'job',
        topic,
        job: jobOutput,
      };
      this.store.publish(KeyType.CONDUCTOR, message, this.appId, topic);
    }
  }
  registerJobCallback(jobId: string, jobCallback: JobMessageCallback) {
    this.jobCallbacks[jobId] = jobCallback;
  }
  delistJobCallback(jobId: string) {
    delete this.jobCallbacks[jobId];
  }
  hasOneTimeSubscription(context: JobActivityContext): boolean {
    return Boolean(context.metadata.ngn);
  }


  // ***************** JOB COMPLETION/CLEANUP *****************
  async updateJobStatus(context: JobActivityContext, toDecrement: number): Promise<void> {
    if (toDecrement) {
      const activityStatus = await this.store.updateJobStatus(
        context.metadata.jid,
        toDecrement,
        await this.getAppConfig()
      );
      if (CollatorService.isJobComplete(activityStatus)) {
        this.runJobCompletionTasks(context);
      }
    }
  }
  runJobCompletionTasks(context: JobActivityContext) {
    this.resolveAwait(context);
    this.resolveOneTimeSubscription(context);
    this.resolvePersistentSubscriptions(context);
    //todo: this.markJobComplete(context);
  }


  // *************** COMMON/ALIASED STORE METHODS *****************
  async get(key: string) {
    return this.store.getJob(key, await this.getAppConfig());
  }
}

export { PubSubDBService };
