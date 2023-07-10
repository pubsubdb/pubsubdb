// import { RestoreJobContextError, 
//          MapInputDataError, 
//          SubscribeToResponseError, 
//          RegisterTimeoutError, 
//          ExecActivityError, 
//          DuplicateActivityError} from '../../../modules/errors';
import { CollatorService } from "../collator";
import { EngineService } from "../engine";
import { ILogger } from "../logger";
import { MapperService } from '../mapper';
import { MDATA_SYMBOLS } from '../serializer';
import { StoreSignaler } from "../signaler/store";
import { StoreService } from "../store";
import { 
  ActivityType,
  ActivityData,
  ActivityMetadata,
  Consumes } from "../../types/activity";
import { JobState } from "../../types/job";
import {
  MultiResponseFlags,
  RedisClient,
  RedisMulti } from "../../types/redis";
import { StringAnyType } from "../../types/serializer";
import { StreamCode, StreamStatus } from "../../types/stream";
import { TransitionRule, Transitions } from "../../types/transition";
import { formatISODate, getValueByPath, restoreHierarchy } from "../../modules/utils";

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
      this.mapJobData();
      /////// MULTI: START ///////
      const multi = this.store.getMulti();
      //await this.registerTimeout();
      await this.setState(multi);
      const shouldSleep = await this.registerExpectedHook(multi);
      const decrementBy = shouldSleep ? 4 : 3;
      await this.setStatus(decrementBy, multi);
      const multiResponse = await multi.exec() as MultiResponseFlags;
      /////// MULTI: END ///////
      const activityStatus = multiResponse[multiResponse.length - 1];
      const isComplete = CollatorService.isJobComplete(activityStatus as number);
      !shouldSleep && this.transition(isComplete);
      return this.context.metadata.aid;
    //} catch (error) {
      //this.logger.error('activity-process-failed', error);
      // if (error instanceof DuplicateActivityError) {
      // } else if (error instanceof RestoreJobContextError) {
      // } else if (error instanceof MapInputDataError) {
      // } else if (error instanceof SubscribeToResponseError) {
      // } else if (error instanceof RegisterTimeoutError) {
      // } else if (error instanceof ExecActivityError) {
      // } else {
      // }
    //}
  }

  setDuplexLeg(leg: number): void {
    this.leg = leg;
  }

  //********  SIGNALER RE-ENTRY POINT (B)  ********//
  async registerExpectedHook(multi?: RedisMulti): Promise<string | void> {
    if (this.config.hook?.topic) {
      const signaler = new StoreSignaler(this.store, this.logger);
      return await signaler.registerHook(this.config.hook.topic, this.context, multi);
    }
  }
  async processHookSignal(): Promise<number> {
    const signaler = new StoreSignaler(this.store, this.logger);
    const jobId = await signaler.process(this.config.hook.topic, this.data);
    if (jobId) {
      await this.getState(jobId);
      this.bindActivityData('hook');
      this.mapJobData();
      /////// MULTI: START ///////
      const multi = this.engine.store.getMulti();
      await this.setState(multi);
      await this.setStatus(1, multi);
      const multiResponse = await multi.exec() as MultiResponseFlags;
      const activityStatus = multiResponse[multiResponse.length - 1];
      const isComplete = CollatorService.isJobComplete(activityStatus as number);
      this.transition(isComplete);
      return Number(activityStatus);
      /////// MULTI: END ///////
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
    await this.bindActivityState(state);
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
    //todo: only bind ju and err if an activity update
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
  }

  async bindActivityState(state: StringAnyType,): Promise<void> {
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
  }

  bindJobMetadataPaths(): string[] {
    const keys_to_save = this.config.type === 'trigger' ? 'JOB': 'JOB_UPDATE';
    return MDATA_SYMBOLS[keys_to_save].KEYS.map((key) => `metadata/${key}`);
  }

  bindActivityMetadataPaths(): string[] {
    const isFirstLegToRun = this.leg === 1 || this.config.type === 'trigger';
    const keys_to_save = isFirstLegToRun ? 'ACTIVITY': 'ACTIVITY_UPDATE'
    return MDATA_SYMBOLS[keys_to_save].KEYS.map((key) => `output/metadata/${key}`);
  }

  async getState(jobId?: string) {
    //assemble list of paths necessary for the activty context (data and metadata)
    const consumes: Consumes = {};
    for (const [activityId, paths] of Object.entries(this.config.consumes)) {
      consumes[activityId] = [];
      for (const path of paths) {
        consumes[activityId].push(`${activityId}/${path}`);
      }
    }
    consumes[`$${this.config.subscribes}`] = MDATA_SYMBOLS.JOB.KEYS.map((key) => `metadata/${key}`);
    jobId = jobId || this.context.metadata.jid;
    const { id: appId } = await this.engine.getVID();
    const [state, status] = await this.store.getState(jobId, appId, consumes);
    const context = restoreHierarchy(state);
    this.initSelf(context);
    this.initPolicies(context);
    this.context = context as JobState;
  }

  initSelf(context: StringAnyType) {
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
  }

  initPolicies(context) {
    //`retry` and `del` policies
    context.metadata.del = this.config.del;
  }

  bindActivityData(type: 'output' | 'hook'): void {
    if (type === 'output') {
      this.context[this.metadata.aid].output.data = this.data;
    } else {
      this.context[this.metadata.aid].hook.data = this.data;
    }
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
    this.engine.setStatus(this.context, toDecrement);
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
