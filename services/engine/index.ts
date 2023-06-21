import { KeyType } from '../../modules/key';
import { formatISODate, getSubscriptionTopic, restoreHierarchy } from '../../modules/utils';
import Activities from '../activities';
import { Activity } from '../activities/activity';
import { Await } from '../activities/await';
import { Exec } from '../activities/exec';
import { Trigger } from '../activities/trigger';
import { CollatorService } from '../collator';
import { CompilerService } from '../compiler';
import { ILogger } from '../logger';
import { ReporterService } from '../reporter';
import { SerializerService } from '../serializer';
import { StoreSignaler } from '../signaler/store';
import { StreamSignaler } from '../signaler/stream';
import { StoreService } from '../store';
import { StreamService } from '../stream';
import { SubService } from '../sub';
import { TaskService } from '../task';
import { AppVID } from '../../types/app';
import { ActivityMetadata, ActivityType, Consumes } from '../../types/activity';
import { CacheMode } from '../../types/cache';
import {
  JobState,
  JobData,
  JobMetadata,
  JobOutput,
  PartialJobState } from '../../types/job';
import {
  PubSubDBApps,
  PubSubDBConfig,
  PubSubDBManifest,
  PubSubDBSettings } from '../../types/pubsubdb';
import { 
  JobMessage,
  JobMessageCallback,
  ReportMessage,
  SubscriptionCallback } from '../../types/quorum';
import { RedisClient, RedisMulti } from '../../types/redis';
import {
  GetStatsOptions,
  IdsResponse,
  JobStatsInput,
  StatsResponse
} from '../../types/stats';
import {
  StreamDataResponse,
  StreamError,
  StreamRole,
  StreamStatus } from '../../types/stream';

//wait time to see if a job is complete
const OTT_WAIT_TIME = 1000;
const REPORT_INTERVAL = 10000;
const STATUS_CODE_SUCCESS = 200;
const STATUS_CODE_TIMEOUT = 504;

class EngineService {
  namespace: string;
  apps: PubSubDBApps | null;
  appId: string;
  guid: string;
  store: StoreService<RedisClient, RedisMulti> | null;
  stream: StreamService<RedisClient, RedisMulti> | null;
  subscribe: SubService<RedisClient, RedisMulti> | null;
  storeSignaler: StoreSignaler | null;
  streamSignaler: StreamSignaler | null;
  task: TaskService | null;
  logger: ILogger;
  cacheMode: CacheMode = 'cache';
  untilVersion: string | null = null;
  jobCallbacks: Record<string, JobMessageCallback> = {};
  reporting = false;
  jobId = 1;

  static async init(namespace: string, appId: string, guid: string, config: PubSubDBConfig, logger: ILogger): Promise<EngineService> {
    if (config.engine) {
      const instance = new EngineService();
      instance.verifyEngineFields(config);

      instance.namespace = namespace;
      instance.appId = appId;
      instance.guid = guid;
      instance.logger = logger;

      //initialize the `store` client (read/write data access)
      instance.store = config.engine.store;
      instance.apps = await instance.store.init(
        instance.namespace,
        instance.appId,
        instance.logger,
      );

      //initialize the `subscribe` client (allows global user subscriptions to topics)
      instance.subscribe = config.engine.sub;
      await instance.subscribe.init(
        instance.namespace,
        instance.appId,
        instance.guid,
        instance.logger
      );

      //initialize the `stream` client (get buffered engine tasks)
      instance.stream = config.engine.stream;
      instance.stream.init(
        instance.namespace,
        instance.appId,
        instance.logger,
      );
      const key = instance.stream.mintKey(
        KeyType.STREAMS,
        { appId: instance.appId },
      );
      instance.streamSignaler = new StreamSignaler(
        {
          namespace: instance.namespace,
          appId: instance.appId,
          guid: instance.guid,
          role: StreamRole.ENGINE
        },
        instance.stream,
        instance.store,
        instance.logger,
      );
      instance.streamSignaler.consumeMessages(
        key,
        'ENGINE',
        instance.guid,
        instance.processWorkerResponse.bind(instance)
      );

      //the storeSignaler sets and resolves external webhooks
      instance.storeSignaler = new StoreSignaler(instance.store, logger);

      //task service handles the execution of activities
      instance.task = new TaskService(instance.store, logger);

      return instance;
    }
  }

  verifyEngineFields(config: PubSubDBConfig) {
    if (!(config.engine.store instanceof StoreService) || 
      !(config.engine.stream instanceof StreamService) ||
      !(config.engine.sub instanceof SubService)) {
      throw new Error('engine config must include `store`, `stream`, and `sub` fields.');
    }
  }

  async getVID(): Promise<AppVID> {
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

  setCacheMode(cacheMode: CacheMode, untilVersion: string) {
    this.logger.info(`engine-rule-cache-updated`, { mode: cacheMode, until: untilVersion });
    this.cacheMode = cacheMode;
    this.untilVersion = untilVersion;
  }

  async routeToSubscribers(topic: string, message: JobOutput) {
    const jobCallback = this.jobCallbacks[message.metadata.jid];
    if (jobCallback) {
      this.delistJobCallback(message.metadata.jid);
      jobCallback(topic, message);
    }
  }

  async processWorkItems() {
    this.task.processWorkItems((this.hook).bind(this));
  }

  async processCleanupItems() {
    this.task.processCleanupItems((this.scrub).bind(this));
  }

  async report() {
    const message: ReportMessage = {
      type: 'report',
      profile: this.streamSignaler.report(),
    };
    await this.store.publish(KeyType.QUORUM, message, this.appId);
    if (!this.reporting) {
      this.reporting = true;
      setTimeout(this.reportNow.bind(this), REPORT_INTERVAL);
    }
  }

  async reportNow(once: boolean = false) {
    try {
      const message: ReportMessage = {
        type: 'report',
        profile: this.streamSignaler.reportNow(),
      };
      await this.store.publish(KeyType.QUORUM, message, this.appId);
      if (!once) {
        setTimeout(this.reportNow.bind(this), REPORT_INTERVAL);
      }
    } catch (err) {
      this.logger.error('engine-report-now-failed', err);
    }
  }

  async throttle(delayInMillis: number) {
    this.streamSignaler.setThrottle(delayInMillis);
  }

  // ************* METADATA/MODEL METHODS *************
  async initActivity(topic: string, data: JobData, context?: JobState): Promise<Activity> {
    if (!data) {
      throw new Error(`payload data is required and must be an object`);
    }
    const [activityId, schema] = await this.getSchema(topic);
    const ActivityHandler = Activities[schema.type];
    if (ActivityHandler) {
      const utc = formatISODate(new Date());
      const metadata: ActivityMetadata = {
        aid: activityId,
        atp: schema.type,
        stp: schema.subtype,
        ac: utc,
        au: utc
      };
      const hook = null;
      return new ActivityHandler(schema, data, metadata, hook, this, context);
    } else {
      throw new Error(`activity type ${schema.type} not found`);
    }
  }
  async getSchema(topic: string): Promise<[activityId: string, schema: ActivityType]> {
    const app = await this.store.getApp(this.appId);
    if (!app) {
      throw new Error(`no app found for id ${this.appId}`);
    }
    if (this.isPrivate(topic)) {
      //private subscriptions use the schema id (.activityId)
      const activityId = topic.substring(1)
      const schema = await this.store.getSchema(activityId, await this.getVID());
      return [activityId, schema];
    } else {
      //public subscriptions use a topic (a.b.c) that is associated with a schema id
      const activityId = await this.store.getSubscription(topic, await this.getVID());
      if (activityId) {
        const schema = await this.store.getSchema(activityId, await this.getVID());
        return [activityId, schema];
      }
    }
    throw new Error(`no subscription found for topic ${topic} in app ${this.appId} for app version ${app.version}`);
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

  // ************* REPORTER METHODS *************
  async getStats(topic: string, query: JobStatsInput): Promise<StatsResponse> {
    const { id, version } = await this.getVID();
    const reporter = new ReporterService({ id, version }, this.store, this.logger);
    const resolvedQuery = await this.resolveQuery(topic, query);
    return await reporter.getStats(resolvedQuery);
  }
  async getIds(topic: string, query: JobStatsInput, queryFacets = []): Promise<IdsResponse> {
    const { id, version } = await this.getVID();
    const reporter = new ReporterService({ id, version }, this.store, this.logger);
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
    const context: PartialJobState = {
      metadata: {
        jid: streamData.metadata.jid,
        aid: streamData.metadata.aid,
      },
      data: streamData.data,
    };
    const activityHandler = await this.initActivity(`.${streamData.metadata.aid}`, context.data, context as JobState) as Exec;
    //return void; it is a signal to the
    await activityHandler.processWorkerResponse(streamData.status, streamData.code);
  }

  // ***************** `ASYNC` ACTIVITY RE-ENTRY POINT ****************
  hasParentJob(context: JobState): boolean {
    return Boolean(context.metadata.pj && context.metadata.pa);
  }
  async resolveAwait(context: JobState) {
    if (this.hasParentJob(context)) {
      const completedJobId = context.metadata.jid;
      const topic = context.metadata.tpc;
      const output = await this.getState(topic, completedJobId);
      const error = this.resolveError(output.metadata);
      const parentContext: Partial<JobState> = {
        data: error || output.data || {},
        metadata: {
          ...context.metadata,
          jid: context.metadata.pj,
          aid: context.metadata.pa,
          pj: undefined,
          pa: undefined,
        }
      };
      const activityHandler = await this.initActivity(`.${parentContext.metadata.aid}`, parentContext.data, parentContext as JobState) as Await;
      const status = error ? StreamStatus.ERROR : StreamStatus.SUCCESS;
      const code = error ? error.code : STATUS_CODE_SUCCESS;
      return await activityHandler.resolveAwait(status, code);
    }
  }
  resolveError(metadata: JobMetadata): StreamError | undefined {
    if (metadata && metadata.err) {
      return JSON.parse(metadata.err) as StreamError;
    }
  }

  // ****************** `SCRUB` CLEAN COMPLETED JOBS *****************
  async scrub(jobId: string) {
    await this.store.scrub(jobId);
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
    const config = await this.getVID();
    const hookRule = await this.storeSignaler.getHookRule(hookTopic);
    if (hookRule) {
      const subscriptionTopic = await getSubscriptionTopic(hookRule.to, this.store, config)
      const resolvedQuery = await this.resolveQuery(subscriptionTopic, query);
      const reporter = new ReporterService(config, this.store, this.logger);
      const workItems = await reporter.getWorkItems(resolvedQuery, queryFacets);
      const taskService = new TaskService(this.store, this.logger);
      await taskService.enqueueWorkItems(
        workItems.map(
          workItem => `${hookTopic}::${workItem}::${JSON.stringify(data)}`
      ));
      this.store.publish(
        KeyType.QUORUM,
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
  async pub(topic: string, data: JobData, context?: JobState) {
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
    return await this.subscribe.subscribe(KeyType.QUORUM, subscriptionCallback, this.appId, topic);
  }
  //unsubscribe to all jobs for a topic
  //todo: verify proper garbage collection/dereferencing
  async unsub(topic: string): Promise<void> {
    return await this.subscribe.unsubscribe(KeyType.QUORUM, this.appId, topic);
  }
  //publish and await (returns the job and data (if ready)); throws error with jobid if not
  async pubsub(topic: string, data: JobData, timeout = OTT_WAIT_TIME): Promise<JobOutput> {
    const context = { metadata: { ngn: this.guid } } as JobState;
    const jobId = await this.pub(topic, data, context);
    return new Promise((resolve, reject) => {
      this.registerJobCallback(jobId, (topic: string, output: JobOutput) => {
        if (output.metadata.err) {
          const error = JSON.parse(output.metadata.err) as StreamError;
          reject({
            ...error,
            job_id: output.metadata.jid,
          });
        } else {
          resolve(output);
        }
      });
      setTimeout(() => {
        this.delistJobCallback(jobId);
        reject({
          code: STATUS_CODE_TIMEOUT,
          message: 'timeout',
          job_id: jobId
        } as StreamError);
      }, timeout);
    });
  }
  async resolveOneTimeSubscription(context: JobState) {
    if (this.hasOneTimeSubscription(context)) {
      const jobOutput = await this.getState(context.metadata.tpc, context.metadata.jid);
      const message: JobMessage = {
        type: 'job',
        topic: context.metadata.jid,
        job: restoreHierarchy(jobOutput) as JobOutput,
      };
      this.store.publish(KeyType.QUORUM, message, this.appId, context.metadata.ngn);
    }
  }
  async resolvePersistentSubscriptions(context: JobState) {
    const config = await this.getVID();
    const activityId = context.metadata.aid || context['$self']?.output?.metadata?.aid;
    const schema = await this.store.getSchema(activityId, config);
    const topic = schema.publishes;
    if (topic) {
      const jobOutput = await this.getState(context.metadata.tpc, context.metadata.jid);
      const message: JobMessage = {
        type: 'job',
        topic,
        job: restoreHierarchy(jobOutput) as JobOutput,
      };
      this.store.publish(KeyType.QUORUM, message, this.appId, topic);
    }
  }
  registerJobCallback(jobId: string, jobCallback: JobMessageCallback) {
    this.jobCallbacks[jobId] = jobCallback;
  }
  delistJobCallback(jobId: string) {
    delete this.jobCallbacks[jobId];
  }
  hasOneTimeSubscription(context: JobState): boolean {
    return Boolean(context.metadata.ngn);
  }


  // ***************** JOB COMPLETION/CLEANUP *****************
  async setStatus(context: JobState, toDecrement: number): Promise<void> {
    if (toDecrement) {
      const { id: appId } = await this.getVID();
      const activityStatus = await this.store.setStatus(
        toDecrement,
        context.metadata.jid,
        appId
      );
      if (CollatorService.isJobComplete(activityStatus)) {
        this.runJobCompletionTasks(context);
      }
    }
  }
  runJobCompletionTasks(context: JobState) {
    //todo: optimize; when publishing (one time or peristent) just gen the payload once;
    this.resolveAwait(context);
    this.resolveOneTimeSubscription(context);
    this.resolvePersistentSubscriptions(context);
    this.task.registerJobForCleanup(context.metadata.jid, context.metadata.del);
  }


  // ****** GET JOB STATE/COLLATION STATUS BY ID *********
  async getStatus(jobId: string): Promise<number> {
    const { id: appId } = await this.getVID();
    return this.store.getStatus(jobId, appId);
  }
  async getState(topic: string, jobId: string): Promise<JobOutput> {
    const { id: appId } = await this.getVID();
    const jobSymbols = await this.store.getSymbols(`$${topic}`, appId);
    const consumes: Consumes = {
      [`$${topic}`]: Object.keys(jobSymbols)
    }
    const output = await this.store.getState(jobId, appId, consumes);
    if (!output) {
      throw new Error(`not found ${jobId}`);
    }
    const [state, status] = output;
    const stateTree = restoreHierarchy(state) as JobOutput;
    stateTree.metadata.js = status;
    return stateTree;
  }

  async compress(terms: string[]): Promise<boolean> {
    const existingSymbols = await this.store.getSymbolValues();
    const startIndex = Object.keys(existingSymbols).length;
    const maxIndex = Math.pow(52, 2) - 1;
    const newSymbols = SerializerService.filterSymVals(startIndex, maxIndex, existingSymbols, new Set(terms));
    return await this.store.addSymbolValues(newSymbols);
  }
}

export { EngineService };
