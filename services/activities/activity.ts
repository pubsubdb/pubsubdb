// import { GetStateError, 
//          SetStateError,
//          MapDataError, 
//          RegisterTimeoutError, 
//          ExecActivityError } from '../../../modules/errors';
import packageJson from '../../package.json';
import {
  formatISODate,
  getValueByPath,
  restoreHierarchy } from "../../modules/utils";
import { CollatorService } from "../collator";
import { EngineService } from "../engine";
import { ILogger } from "../logger";
import { MapperService } from '../mapper';
import { Pipe } from "../pipe";
import { MDATA_SYMBOLS } from '../serializer';
import { StoreSignaler } from "../signaler/store";
import { StoreService } from "../store";
import { 
  ActivityType,
  ActivityData,
  ActivityMetadata,
  Consumes } from "../../types/activity";
import { JobState, JobStatus } from "../../types/job";
import {
  MultiResponseFlags,
  RedisClient,
  RedisMulti } from "../../types/redis";
import { StringAnyType } from "../../types/serializer";
import { StreamCode, StreamStatus } from "../../types/stream";
import {
  Span,
  SpanContext,
  SpanKind,
  trace,
  Context,
  context } from "../../types/telemetry";
import { TransitionRule, Transitions } from "../../types/transition";

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
  leg: number = 0;

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
    //try {
      this.setDuplexLeg(1);
      await this.getState();
      const span = this.startSpan();
      /////// MULTI: START ///////
      const multi = this.store.getMulti();
      //await this.registerTimeout();
      const shouldSleep = await this.registerHook(multi);
      this.mapJobData();
      await this.setState(multi);
      const decrementBy = shouldSleep ? 4 : 3;
      await this.setStatus(decrementBy, multi);
      const multiResponse = await multi.exec() as MultiResponseFlags;
      /////// MULTI: END ///////
      const activityStatus = multiResponse[multiResponse.length - 1];
      const isComplete = CollatorService.isJobComplete(activityStatus as number);
      !shouldSleep && this.transition(isComplete);
      this.endSpan(span);
      return this.context.metadata.aid;
    //} catch (error) {
      //this.logger.error('activity-process-failed', error);
      // if (error instanceof GetStateError) {
      // } else if (error instanceof SetStateError) {
      // } else if (error instanceof MapDataError) {
      // } else if (error instanceof RegisterTimeoutError) {
      // } else if (error instanceof ExecActivityError) {
      // } else {
      // }
    //}
  }

  setDuplexLeg(leg: number): void {
    this.leg = leg;
  }

  startSpan(leg = this.leg, spanName?: string): Span {
    const tracer = trace.getTracer(packageJson.name, packageJson.version);
    let parentContext = this.getParentSpanContext(leg);
    spanName = spanName || `${this.config.type.toUpperCase()}/${this.engine.appId}/${this.metadata.aid}`;
    const span = tracer.startSpan(
      spanName,
      { kind: SpanKind.CLIENT, attributes: this.getSpanAttrs(leg), root: !parentContext },
      parentContext
    );
    this.setTelemetryContext(span, leg);
    return span;
  }

  endSpan(span: Span): void {
    span.end();
  }

  getParentSpanContext(leg: number): undefined | Context {
    const traceId = this.getTraceId();
    const spanId = this.getParentSpanId(leg);
    if (traceId && spanId) {
      const restoredSpanContext: SpanContext = {
        traceId,
        spanId,
        isRemote: true,
        traceFlags: 1, // (todo: revisit sampling strategy/config)
      };
      const parentContext = trace.setSpanContext(context.active(), restoredSpanContext);
      return parentContext;
    }
  }

  getParentSpanId(leg: number): string | undefined {
    if (leg === 1) {
      return this.context[this.config.parent].output?.metadata?.l2s;
    } else {
      return this.context['$self'].output?.metadata?.l1s;
    }
  }

  getTraceId(): string | undefined {
    return this.context.metadata.trc;
  }

  getSpanAttrs(leg: number): StringAnyType {
    return {
      ...Object.keys(this.context.metadata).reduce((result, key) => {
        result[`job/${key}`] = this.context.metadata[key];
        return result;
      }, {}),
      ...Object.keys(this.metadata).reduce((result, key) => {
        result[`activity/${key}`] = this.metadata[key];
        return result;
      }, {}),
      'activity/leg': leg,
    };
  };

  setTelemetryContext(span: Span, leg: number) {
    if (!this.context.metadata.trc) {
      this.context.metadata.trc = span.spanContext().traceId;
    }
    if (leg === 1) {
      if (!this.context['$self'].output.metadata) {
        this.context['$self'].output.metadata = {};
      }
      this.context['$self'].output.metadata.l1s = span.spanContext().spanId;
    } else {
      if (!this.context['$self'].output.metadata) {
        this.context['$self'].output.metadata = {};
      }
      this.context['$self'].output.metadata.l2s = span.spanContext().spanId;
    }
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
    } //else already resolved
  }
  async processTimeHookEvent(jobId: string): Promise<JobStatus | void> {
    this.logger.debug('engine-process-time-hook-event', {
      jid: jobId,
      aid: this.metadata.aid
    });
    return await this.processHookEvent(jobId);
  }
  async processHookEvent(jobId: string): Promise<JobStatus | void> {
    this.setDuplexLeg(2);
    await this.getState(jobId);
    const span = this.startSpan();
    this.bindActivityData('hook');
    this.mapJobData();
    /////// MULTI: START ///////
    const multi = this.engine.store.getMulti();
    await this.setState(multi);
    await this.setStatus(1, multi);
    const multiResponse = await multi.exec() as MultiResponseFlags;
    const activityStatus = multiResponse[multiResponse.length - 1];
    const isComplete = CollatorService.isJobComplete(activityStatus as number);
    await this.transition(isComplete);
    this.endSpan(span);
    return Number(activityStatus);
    /////// MULTI: END ///////
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
    this.bindJobTelemetryToState(state);
  }

  bindJobTelemetryToState(state: StringAnyType): void {
    //no-op
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
    this.bindActivityTelemetryToState(state);
  }

  bindActivityTelemetryToState(state: StringAnyType): void {
    const target = `l${this.leg}s`;
    state[`${this.metadata.aid}/output/metadata/${target}`] = this.context['$self'].output.metadata[target];
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
    this.addTargetTelemetryPaths(consumes);
    jobId = jobId || this.context.metadata.jid;
    const { id: appId } = await this.engine.getVID();
    //`state` is a flat hash
    const [state, status] = await this.store.getState(jobId, appId, consumes);
    //`context` is a tree
    this.context = restoreHierarchy(state) as JobState;
    this.initSelf(this.context);
    this.initPolicies(this.context);
  }

  addTargetTelemetryPaths(consumes: Consumes): void {
    //restore the telemetry parent span context (query for the parent span id)
    if (this.leg === 1) {
      if (!(this.config.parent in consumes)) {
        consumes[this.config.parent] = [];
      }
      consumes[this.config.parent].push(`${this.config.parent}/output/metadata/l2s`);
    } else {
      if (!(this.metadata.aid in consumes)) {
        consumes[this.metadata.aid] = [];
      }
      consumes[this.metadata.aid].push(`${this.metadata.aid}/output/metadata/l1s`);
    }
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
      //transitions can cascade through the descendant activities
      let toDecrement = 0;
      const transitions = await this.store.getTransitions(await this.engine.getVID());
      const transition = transitions[`.${this.metadata.aid}`];
      if (transition) {
        for (const toActivityId in transition) {
          const transitionRule: boolean|TransitionRule = transition[toActivityId];
          if (MapperService.evaluate(transitionRule, this.context)) {
            await this.engine.pub(
              `.${toActivityId}`,
              {},
              this.context
            );
          } else {
            toDecrement = await this.skipDescendants(toActivityId, transitions, toDecrement);
          }
        }
      }
      return toDecrement;
    }
  }
}

export { Activity, ActivityType };
