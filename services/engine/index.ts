import { KeyType } from '../../modules/key';
import { getSubscriptionTopic } from '../../modules/utils';
import Activities from '../activities';
import { Activity } from '../activities/activity';
import { Await } from '../activities/await';
import { Exec } from '../activities/exec';
import { Trigger } from '../activities/trigger';
import { CollatorService } from '../collator';
import { CompilerService } from '../compiler';
import { ILogger } from '../logger';
import { ReporterService } from '../reporter';
import { StoreSignaler } from '../signaler/store';
import { StreamSignaler } from '../signaler/stream';
import { StoreService } from '../store';
import { StreamService } from '../stream';
import { SubService } from '../sub';
import { TaskService } from '../task';
import { AppVID } from '../../typedefs/app';
import { ActivityMetadata, ActivityType } from '../../typedefs/activity';
import { CacheMode } from '../../typedefs/cache';
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
import { 
  JobMessage,
  JobMessageCallback,
  ReportMessage,
  SubscriptionCallback } from '../../typedefs/quorum';
import { RedisClient, RedisMulti } from '../../typedefs/redis';
import {
  GetStatsOptions,
  IdsResponse,
  JobStatsInput,
  StatsResponse
} from '../../typedefs/stats';
import { StreamDataResponse } from '../../typedefs/stream';

//wait time to see if a job is complete
const OTT_WAIT_TIME = 1000;

const REPORT_INTERVAL = 10000;

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
  logger: ILogger;
  cacheMode: CacheMode = 'cache';
  untilVersion: string | null = null;
  jobCallbacks: Record<string, JobMessageCallback> = {};
  reporting = false;

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
        instance.namespace,
        instance.appId,
        instance.guid,
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
    this.logger.info(`setting mode to ${cacheMode}`);
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
    const taskService = new TaskService(this.store, this.logger);
    taskService.processWorkItems((this.hook).bind(this));
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
      this.logger.error('engine.reportNow.error', err);
    }
  }

  async throttle(delayInMillis: number) {
    this.streamSignaler.setThrottle(delayInMillis);
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
        const activity = await this.store.getSchema(activityId, await this.getVID());
        return [activityId, activity];
      } else {
        //public subscriptions use a topic (a.b.c) that is associated with an activity id
        const activityId = await this.store.getSubscription(topic, await this.getVID());
        if (activityId) {
          const activity = await this.store.getSchema(activityId, await this.getVID());
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
      const config = await this.getVID();
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
    return await this.subscribe.subscribe(KeyType.QUORUM, subscriptionCallback, this.appId, topic);
  }
  //unsubscribe to all jobs for a topic
  //todo: verify proper garbage collection/dereferencing
  async unsub(topic: string): Promise<void> {
    return await this.subscribe.unsubscribe(KeyType.QUORUM, this.appId, topic);
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
      const config = await this.getVID();
      const jobOutput = await this.store.getJobOutput(context.metadata.jid, config);
      const message: JobMessage = {
        type: 'job',
        topic: context.metadata.jid,
        job: jobOutput,
      };
      this.store.publish(KeyType.QUORUM, message, this.appId, context.metadata.ngn);
    }
  }
  async resolvePersistentSubscriptions(context: JobActivityContext) {
    const config = await this.getVID();
    const schema = await this.store.getSchema(context.metadata.aid, config);
    const topic = schema.publishes;
    if (topic) {
      const jobOutput = await this.store.getJobOutput(context.metadata.jid, config);
      const message: JobMessage = {
        type: 'job',
        topic,
        job: jobOutput,
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
  hasOneTimeSubscription(context: JobActivityContext): boolean {
    return Boolean(context.metadata.ngn);
  }


  // ***************** JOB COMPLETION/CLEANUP *****************
  async updateJobStatus(context: JobActivityContext, toDecrement: number): Promise<void> {
    if (toDecrement) {
      const activityStatus = await this.store.updateJobStatus(
        context.metadata.jid,
        toDecrement,
        await this.getVID()
      );
      if (CollatorService.isJobComplete(activityStatus)) {
        this.runJobCompletionTasks(context);
      }
    }
  }
  runJobCompletionTasks(context: JobActivityContext) {
    this.resolveAwait(context);
    //todo: optimize; when publishing (one time or peristent) just gen the payload once;
    this.resolveOneTimeSubscription(context);
    this.resolvePersistentSubscriptions(context);
    //todo: this.markJobComplete(context);
  }


  // ****** GET A JOB/METADATA BY ID *********
  async get(key: string) {
    return this.store.getJob(key, await this.getVID());
  }
  async getJobMetadata(key: string) {
    return this.store.getJobMetadata(key, await this.getVID());
  }
}

export { EngineService };
