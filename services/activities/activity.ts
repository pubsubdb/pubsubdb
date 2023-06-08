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
import { StoreSignaler } from "../signaler/store";
import { StoreService } from "../store";
import { SerializerService } from '../store/serializer';
import { 
  ActivityType,
  ActivityData,
  ActivityMetadata,
  FlattenedDataObject, 
  HookData} from "../../typedefs/activity";
import { JobActivityContext, JobMetadata } from "../../typedefs/job";
import {
  MultiResponseFlags,
  RedisClient,
  RedisMulti } from "../../typedefs/redis";
import { StreamCode, StreamStatus } from "../../typedefs/stream";
import { TransitionRule, Transitions } from "../../typedefs/transition";

/**
 * The base class for all activities
 */
class Activity {
  config: ActivityType;
  data: ActivityData;
  metadata: ActivityMetadata;
  store: StoreService<RedisClient, RedisMulti>
  hook: HookData;
  context: JobActivityContext;
  engine: EngineService;
  logger: ILogger;
  status: StreamStatus = StreamStatus.SUCCESS;
  code: StreamCode = 200;

  constructor(
    config: ActivityType,
    data: ActivityData,
    metadata: ActivityMetadata,
    hook: HookData | null,
    engine: EngineService,
    context?: JobActivityContext) {
      this.config = config;
      this.data = data;
      this.metadata = metadata;
      this.hook = hook;
      this.engine = engine;
      this.context = context || { data: {}, metadata: {} } as JobActivityContext;
      this.logger = engine.logger;
      this.store = engine.store;
  }

  //********  INITIAL ENTRY POINT (A)  ********//
  async process(): Promise<string> {
    //try {
      await this.restoreJobContext(this.context.metadata.jid);
      this.mapJobData();

      /////// MULTI: START ///////
      const multi = this.store.getMulti();
      //await this.registerTimeout();   //subclasses MUST implement
      await this.saveJob(multi);
      await this.saveActivity(multi);
      const shouldSleep = await this.registerExpectedHook(multi);
      const decrementBy = shouldSleep ? 4 : 3;
      await this.saveActivityStatus(decrementBy, multi);
      const multiResponse = await multi.exec() as MultiResponseFlags;
      /////// MULTI: END ///////

      const activityStatus = multiResponse[multiResponse.length - 1];
      const isComplete = CollatorService.isJobComplete(activityStatus as number);
      !shouldSleep && this.transition(isComplete);
      return this.context.metadata.aid;
    //} catch (error) {
      //this.logger.error('activity.process:error', error);
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

  //********  SIGNALER RE-ENTRY POINT (B)  ********//
  async registerExpectedHook(multi?: RedisMulti): Promise<string | void> {
    if (this.config.hook?.topic) {
      const signaler = new StoreSignaler(this.store, this.logger);
      return await signaler.registerHook(this.config.hook.topic, this.context, multi);
    }
  }
  async processHookSignal(): Promise<void> {
    const signaler = new StoreSignaler(this.store, this.logger);
    const jobId = await signaler.process(this.config.hook.topic, this.data);
    if (jobId) {
      await this.restoreJobContext(jobId);
      this.bindActivityData('hook');
      this.mapJobData();
      this.mapActivityData('hook');
      /////// MULTI: START ///////
      const multi = this.engine.store.getMulti();
      await this.saveActivity(multi);
      await this.saveJob(multi);
      await this.saveActivityStatus(1, multi);
      const multiResponse = await multi.exec() as MultiResponseFlags;
      const activityStatus = multiResponse[multiResponse.length - 1];
      const isComplete = CollatorService.isJobComplete(activityStatus as number);
      this.transition(isComplete);
      /////// MULTI: END ///////
    }
  }

  async restoreJobContext(jobId: string): Promise<void> {
    const config = await this.engine.getVID();
    this.context = await this.store.restoreContext(
      jobId,
      this.config.depends,
      config
    ) as JobActivityContext;
    if (!this.context[this.metadata.aid]) {
      this.context[this.metadata.aid] = { input: {}, output: {}, hook: {} };
    }
    //alias '$self' to the activity id
    this.context['$self'] = this.context[this.metadata.aid];
  }

  mapActivityData(target: string) {
    const aid = this.metadata.aid;
    const filteredData: FlattenedDataObject = {};
    const toFlatten = { [aid]: { [target]: { data: this.data } } };
    const rulesSet = new Set(this.config.dependents.map(rule => rule.slice(1, -1).replace(/\./g, '/')));
    const flattenedData = SerializerService.flattenHierarchy(toFlatten);
    for (const [key, value] of Object.entries(flattenedData)) {
      if (rulesSet.has(key)) {
        filteredData[key as string] = value as string;
      }
    }
    const restoredData = SerializerService.restoreHierarchy(filteredData);
    if (restoredData[aid]) {
      this.context[aid][target].data = restoredData[aid][target].data;
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
    //base `activity` doesn't duplex
    //but possible to set timeout if a hook is registered
  }

  toSaveJobMetadata(): Partial<JobMetadata> {
    const metadata: Partial<JobMetadata> = {
      ju: new Date().toISOString()
    }
    this.mapAndBindJobError(metadata);
    return metadata;
  }

  mapAndBindJobError(metadata) {
    if (this.status === StreamStatus.ERROR) {
      metadata.err = this.context.metadata.err;
      //todo: map job status via: (500: [3**, 4**, 5**], 202: [$pending])
    }
  }

  bindActivityError(data: Record<string, unknown>): void {
    //todo: map activity error data into the job error (if defined)
    //      map job status via: (500: [3**, 4**, 5**], 202: [$pending])
    this.context.metadata.err = JSON.stringify(data);
  }

  async saveJob(multi?: RedisMulti): Promise<void> {
    await this.store.setJob(
      this.context.metadata.jid,
      this.context.data || {},
      this.toSaveJobMetadata(),
      await this.engine.getVID(),
      multi
    );
  }

  toSaveActivityMetadata(): Partial<JobMetadata> {
    const metadata: ActivityMetadata = { 
      ...this.metadata,
      jid: this.context.metadata.jid,
      key: this.context.metadata.key,
    };
    if (this.status === StreamStatus.ERROR) {
      metadata.err = JSON.stringify(this.data);
    }
    return metadata;
  }

  bindActivityData(type: 'output' | 'hook'): void {
    if (type === 'output') {
      this.context[this.metadata.aid].output.data = this.data;
    } else {
      this.context[this.metadata.aid].hook.data = this.data;
    }
  }

  async saveActivity(multi?: RedisMulti): Promise<void> {
    const jobId = this.context.metadata.jid;
    const activityId = this.metadata.aid;
    await this.store.setActivity(
      jobId,
      activityId,
      this.context[activityId]?.output?.data || {},
      this.toSaveActivityMetadata(),
      this.context[activityId]?.hook?.data || {},
      await this.engine.getVID(),
      multi,
    );
  }

  async saveActivityStatus(multiplier = 1, multi?: RedisMulti): Promise<void> {
    await this.store.updateJobStatus(
      this.context.metadata.jid,
      -this.config.collationInt * multiplier,
      await this.engine.getVID(),
      multi
    );
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
    //if any descendant activity is skipped, toDecrement will
    //be a negative number that can be used to update job status
    const toDecrement = await this.transitionActivity(isComplete);
    //this is an extra call to the db and is job-specific
    //todo: create a 'job' object/class for such methods (use pubsubdb for now)
    this.engine.updateJobStatus(this.context, toDecrement);
  }

  //todo: most efficient path is to count all skipped and decrement with self (just one call to db)
  async transitionActivity(isComplete: boolean): Promise<number> {
    if (isComplete) {
      this.engine.runJobCompletionTasks(this.context);
      return 0;
    } else {
      //transitions can cascade through the descendant activities
      //toDecrement (e.g. -600600) is the result of the cascade
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
