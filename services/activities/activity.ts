import { GetStateError } from '../../modules/errors';
import {
  formatISODate,
  getValueByPath,
  restoreHierarchy } from '../../modules/utils';
import { CollatorService } from '../collator';
import { EngineService } from '../engine';
import { ILogger } from '../logger';
import { MapperService } from '../mapper';
import { Pipe } from '../pipe';
import { MDATA_SYMBOLS } from '../serializer';
import { StoreSignaler } from '../signaler/store';
import { StoreService } from '../store';
import { TelemetryService } from '../telemetry';
import { 
  ActivityData,
  ActivityLeg,
  ActivityMetadata,
  ActivityType,
  Consumes } from '../../types/activity';
import { JobState, JobStatus } from '../../types/job';
import {
  MultiResponseFlags,
  RedisClient,
  RedisMulti } from '../../types/redis';
import { StringAnyType } from '../../types/serializer';
import {
  StreamCode,
  StreamData,
  StreamDataType,
  StreamStatus } from '../../types/stream';
import { TransitionRule, Transitions } from '../../types/transition';

/**
 * The base class for all activities
 */
class Activity {
  config: ActivityType;
  data: ActivityData;
  hook: ActivityData;
  metadata: ActivityMetadata;
  store: StoreService<RedisClient, RedisMulti>
  context: JobState;
  engine: EngineService;
  logger: ILogger;
  status: StreamStatus = StreamStatus.SUCCESS;
  code: StreamCode = 200;
  leg: ActivityLeg;

  constructor(
    config: ActivityType,
    data: ActivityData,
    metadata: ActivityMetadata,
    hook: ActivityData | null,
    engine: EngineService,
    context?: JobState) {
      this.config = config;
      this.data = data;
      this.metadata = metadata;
      this.hook = hook;
      this.engine = engine;
      this.context = context || { data: {}, metadata: {} } as JobState;
      this.logger = engine.logger;
      this.store = engine.store;
  }

  //********  INITIAL ENTRY POINT (A)  ********//
  async process(): Promise<string> {
    this.logger.debug('activity-process', { jid: this.context.metadata.jid, aid: this.metadata.aid });
    let telemetry: TelemetryService;
    try {
      this.setLeg(1);
      await this.getState();
      telemetry = new TelemetryService(this.engine.appId, this.config, this.metadata, this.context);
      telemetry.startActivitySpan(this.leg);

      const multi = this.store.getMulti();
      //await this.registerTimeout();
      const shouldSleep = await this.registerHook(multi);
      this.mapJobData();
      await this.setState(multi);
      const decrementBy = shouldSleep ? 4 : 3;
      await this.setStatus(decrementBy, multi);
      const multiResponse = await multi.exec() as MultiResponseFlags;

      telemetry.mapActivityAttributes();
      const activityStatus = this.resolveStatus(multiResponse);
      telemetry.setActivityAttributes({ 'app.job.jss': activityStatus });
      const isComplete = CollatorService.isJobComplete(activityStatus);
      if (!shouldSleep) {
        await this.transition(isComplete);
      }
      return this.context.metadata.aid;
    } catch (error) {
      if (error instanceof GetStateError) {
        this.logger.error('activity-get-state-error', error);
      } else {
        this.logger.error('activity-process-error', error);
      }
      telemetry.setActivityError(error.message);
      throw error;
    } finally {
      telemetry.endActivitySpan();
      this.logger.debug('activity-process-end', { jid: this.context.metadata.jid, aid: this.metadata.aid });
    }
  }

  setLeg(leg: ActivityLeg): void {
    this.leg = leg;
  }

  //********  SIGNALER RE-ENTRY POINT (B)  ********//
  async registerHook(multi?: RedisMulti): Promise<string | void> {
    if (this.config.hook?.topic) {
      const signaler = new StoreSignaler(this.store, this.logger);
      return await signaler.registerWebHook(this.config.hook.topic, this.context, multi);
    } else if (this.config.sleep) {
      const durationInSeconds = Pipe.resolve(this.config.sleep, this.context);
      const jobId = this.context.metadata.jid;
      const activityId = this.metadata.aid;
      await this.engine.task.registerTimeHook(jobId, activityId, 'sleep', durationInSeconds);
      return jobId;
    }
  }
  async processWebHookEvent(): Promise<JobStatus | void> {
    this.logger.debug('engine-process-web-hook-event', {
      topic: this.config.hook.topic,
      aid: this.metadata.aid
    });
    const signaler = new StoreSignaler(this.store, this.logger);
    const data = { ...this.data };
    const jobId = await signaler.processWebHookSignal(this.config.hook.topic, data);
    if (jobId) {
      await this.processHookEvent(jobId);
      await signaler.deleteWebHookSignal(this.config.hook.topic, data);
    } //else => already resolved
  }
  async processTimeHookEvent(jobId: string): Promise<JobStatus | void> {
    this.logger.debug('engine-process-time-hook-event', {
      jid: jobId,
      aid: this.metadata.aid
    });
    return await this.processHookEvent(jobId);
  }
  async processHookEvent(jobId: string): Promise<JobStatus | void> {
    this.logger.debug('activity-process-hook-event', { jobId });
    let telemetry: TelemetryService;
    try {
      this.setLeg(2);
      await this.getState(jobId);
      telemetry = new TelemetryService(this.engine.appId, this.config, this.metadata, this.context);
      telemetry.startActivitySpan(this.leg);
      this.bindActivityData('hook');
      this.mapJobData();

      const multi = this.engine.store.getMulti();
      await this.setState(multi);
      await this.setStatus(1, multi);
      const multiResponse = await multi.exec() as MultiResponseFlags;
      telemetry.mapActivityAttributes();

      const activityStatus = this.resolveStatus(multiResponse);
      telemetry.setActivityAttributes({ 'app.job.jss': activityStatus });
      const isComplete = CollatorService.isJobComplete(activityStatus);
      await this.transition(isComplete);
      return activityStatus as number - 0;
    } catch (error) {
      this.logger.error('engine-process-hook-event-error', error);
      telemetry.setActivityError(error.message);
      throw error;
    } finally {
      telemetry.endActivitySpan();
    }
  }

  resolveStatus(multiResponse: MultiResponseFlags): number {
    const activityStatus = multiResponse[multiResponse.length - 1];
    if (Array.isArray(activityStatus)) {
      return Number(activityStatus[1]);
    } else {
      return Number(activityStatus);
    }
  }

  mapJobData(): void {
    if(this.config.job?.maps) {
      const mapper = new MapperService(this.config.job.maps, this.context);
      this.context.data = mapper.mapRules();
    }
  }

  mapInputData(): void {
    if(this.config.input?.maps) {
      const mapper = new MapperService(this.config.input.maps, this.context);
      this.context.data = mapper.mapRules();
    }
  }

  async registerTimeout(): Promise<void> {
    //set timeout in support of hook and/or duplex
  }

  bindActivityError(data: Record<string, unknown>): void {
    //todo: map activity error data into the job error (if defined)
    //      map job status via: (500: [3**, 4**, 5**], 202: [$pending])
    this.context.metadata.err = JSON.stringify(data);
  }

  async getTriggerConfig(): Promise<ActivityType> {
    return await this.store.getSchema(
      this.config.trigger,
      await this.engine.getVID()
    );
  }

  getJobStatus(): null | number {
    return null;
  }

  async setStatus(multiplier = 1, multi?: RedisMulti): Promise<void> {
    const { id: appId } = await this.engine.getVID();
    await this.store.setStatus(
      -this.config.collationInt * multiplier,
      this.context.metadata.jid,
      appId,
      multi
    );
  }

  async setState(multi?: RedisMulti): Promise<string> {
    const { id: appId } = await this.engine.getVID();
    const jobId = this.context.metadata.jid;
    this.bindJobMetadata();
    this.bindActivityMetadata();
    let state: StringAnyType = {};
    await this.bindJobState(state);
    this.bindActivityState(state);
    const symbolNames = [`$${this.config.subscribes}`, this.metadata.aid];
    return await this.store.setState(state, this.getJobStatus(), jobId, appId, symbolNames, multi);
  }

  bindJobMetadata(): void {
    //both legs of the most recently run activity (1 and 2) modify ju (job_updated)
    this.context.metadata.ju = formatISODate(new Date());
  }

  bindActivityMetadata(): void {
    const self: StringAnyType = this.context['$self'];
    if (!self.output.metadata) {
      self.output.metadata = {};
    }
    if (this.status === StreamStatus.ERROR) {
      self.output.metadata.err = JSON.stringify(this.data);
    }
    self.output.metadata.ac = 
      self.output.metadata.au = formatISODate(new Date());
    self.output.metadata.atp = this.config.type;
    if (this.config.subtype) {
      self.output.metadata.stp = this.config.subtype;
    }
    self.output.metadata.aid = this.metadata.aid;
  }

  async bindJobState(state: StringAnyType): Promise<void> {
    const triggerConfig = await this.getTriggerConfig();
    const PRODUCES = [
      ...(triggerConfig.PRODUCES || []),
      ...this.bindJobMetadataPaths()
    ];
    for (const path of PRODUCES) {
      const value = getValueByPath(this.context, path);
      if (value !== undefined) {
        state[path] = value;
      }
    }
    TelemetryService.bindJobTelemetryToState(state, this.config, this.context);
  }

  bindActivityState(state: StringAnyType,): void {
    const produces = [
      ...this.config.produces,
      ...this.bindActivityMetadataPaths()
    ];
    for (const path of produces) {
      const prefixedPath = `${this.metadata.aid}/${path}`;
      const value = getValueByPath(this.context, prefixedPath);
      if (value !== undefined) {
        state[prefixedPath] = value;
      } 
    }
    TelemetryService.bindActivityTelemetryToState(state, this.config, this.metadata, this.context, this.leg);
  }

  bindJobMetadataPaths(): string[] {
    return MDATA_SYMBOLS.JOB_UPDATE.KEYS.map((key) => `metadata/${key}`);
  }

  bindActivityMetadataPaths(): string[] {
    const keys_to_save = this.leg === 1 ? 'ACTIVITY': 'ACTIVITY_UPDATE'
    return MDATA_SYMBOLS[keys_to_save].KEYS.map((key) => `output/metadata/${key}`);
  }

  async getState(jobId?: string) {
    //assemble list of paths necessary to create 'job state'
    const jobSymbolHashName = `$${this.config.subscribes}`;
    const consumes: Consumes = {
      [jobSymbolHashName]: MDATA_SYMBOLS.JOB.KEYS.map((key) => `metadata/${key}`)
    };
    for (let [activityId, paths] of Object.entries(this.config.consumes)) {
       if(activityId === '$job') {
        for (const path of paths) {
          consumes[jobSymbolHashName].push(path);
        }
      } else {
        if (activityId === '$self') {
          activityId = this.metadata.aid;
        }
        if (!consumes[activityId]) {
          consumes[activityId] = [];
        }
        for (const path of paths) {
          consumes[activityId].push(`${activityId}/${path}`);
        }
      }
    }
    TelemetryService.addTargetTelemetryPaths(consumes, this.config, this.metadata, this.leg);
    jobId = jobId || this.context.metadata.jid;
    const { id: appId } = await this.engine.getVID();
    //`state` is a flat hash
    const [state, status] = await this.store.getState(jobId, appId, consumes);
    //`context` is a tree
    this.context = restoreHierarchy(state) as JobState;
    this.initSelf(this.context);
    this.initPolicies(this.context);
  }

  initSelf(context: StringAnyType): JobState {
    const activityId = this.metadata.aid;
    if (!context[activityId]) {
      context[activityId] = { };
    }
    const self = context[activityId];
    if (!self.output) {
      self.output = { };
    }
    if (!self.input) {
      self.input = { };
    }
    if (!self.hook) {
      self.hook = { };
    }
    context['$self'] = self;
    context['$job'] = context; //NEVER call STRINGIFY! (circular)
    return context as JobState;
  }

  initPolicies(context: JobState) {
    context.metadata.expire = this.config.expire;
  }

  bindActivityData(type: 'output' | 'hook'): void {
    this.context[this.metadata.aid][type].data = this.data;
  }  

  async skipDescendants(activityId: string, transitions: Transitions, toDecrement: number): Promise<number> {
    const config = await this.engine.getVID();
    const schema = await this.store.getSchema(activityId, config);
    toDecrement = toDecrement - (schema.collationInt * 6); // 3 = 'skipped'
    const transition = transitions[`.${activityId}`];
    if (transition) {
      for (const toActivityId in transition) {
        toDecrement = await this.skipDescendants(toActivityId, transitions, toDecrement);
      }
    }
    return toDecrement;
  }

  async transition(isComplete: boolean): Promise<void> {
    //if any descendant activity is skipped, toDecrement will be negative
    const toDecrement = await this.transitionActivity(isComplete);
    //this is an extra call to the db and is job-specific
    await this.engine.setStatus(this.context, toDecrement);
  }

  //todo: most efficient path is to count all skipped and decrement with self (just one call to db)
  async transitionActivity(isComplete: boolean): Promise<number> {
    if (isComplete) {
      this.engine.runJobCompletionTasks(this.context);
      return 0;
    } else {
      let toDecrement = 0;
      const transitions = await this.store.getTransitions(await this.engine.getVID());
      const transition = transitions[`.${this.metadata.aid}`];
      if (transition) {
        for (const toActivityId in transition) {
          const transitionRule: boolean | TransitionRule = transition[toActivityId];
          if (MapperService.evaluate(transitionRule, this.context, this.code)) {
            await this.execAdjacent(toActivityId);
          } else {
            //cancelled transitions cascade
            toDecrement = await this.skipDescendants(toActivityId, transitions, toDecrement);
          }
        }
      }
      return toDecrement;
    }
  }

  async execAdjacent(aid: string): Promise<string> {
    const streamData: StreamData = {
      metadata: {
        jid: this.context.metadata.jid,
        aid,
        spn: this.context['$self'].output.metadata?.l2s,
        trc: this.context.metadata.trc,
      },
      type: StreamDataType.TRANSITION,
      data: {}
    };
    if (this.config.retry) {
      streamData.policies = {
        retry: this.config.retry
      };
    }
    return await this.engine.streamSignaler?.publishMessage(null, streamData);
  }
}

export { Activity, ActivityType };
