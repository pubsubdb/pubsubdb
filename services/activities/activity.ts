// import { RestoreJobContextError, 
//          MapInputDataError, 
//          SubscribeToResponseError, 
//          RegisterTimeoutError, 
//          ExecActivityError, 
//          DuplicateActivityError} from '../../../modules/errors';
import { CollatorService } from "../collator";
import { ILogger } from "../logger";
import { MapperService } from '../mapper';
import { StoreSignaler } from "../signaler/store";
import { SerializerService } from '../store/serializer';
import { 
  ActivityType,
  ActivityData,
  ActivityMetadata,
  FlattenedDataObject, 
  HookData} from "../../typedefs/activity";
import { JobActivityContext } from "../../typedefs/job";
import { TransitionRule, Transitions } from "../../typedefs/transition";
import { RedisClient, RedisMulti } from "../../typedefs/redis";
import { EngineService } from "../engine";
import { StoreService } from "../store";

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
      //await this.mapInputData();      //subclasses (exec) implement this
      //await this.registerResponse();  //subclasses implement this
      //await this.registerTimeout();   //subclasses implement this
      await this.saveJobData(multi);
      await this.saveActivity(multi);
      const shouldSleep = await this.registerExpectedHook(multi);
      const decrementBy = shouldSleep ? 4 : 3;
      await this.saveActivityStatus(decrementBy, multi);
      const multiResponse = await multi.exec();
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

  //********  RESPONDER ENTRY POINT (B)  ********//
  async registerResponse(): Promise<void> {
    //register to receive eventual async/open-api call response (duplex by default)
  }
  async processResponse(): Promise<void> {
    //persist those output data fields mapped by downstream activities
    //await this.serializeMappedData('output');
    //note: response payloads have a status field (pending, success, error)
    //      pending responses can be persisted to the job as necessary
    //      the job will stay in state '8' until a status of error or success is recieved
  }

  //********  SIGNALER ENTRY POINT (C)  ********//
  async registerExpectedHook(multi?: RedisMulti): Promise<string | void> {
    if (this.config.hook?.topic) {
      const config = await this.engine.getVID();
      const signaler = new StoreSignaler(this.store, this.logger);
      return await signaler.registerHook(this.config.hook.topic, this.context, multi);
    }
  }
  async processHookSignal(): Promise<void> {
    const config = await this.engine.getVID();
    const signaler = new StoreSignaler(this.store, this.logger);
    const jobId = await signaler.process(this.config.hook.topic, this.data);
    if (jobId) {
      await this.restoreJobContext(jobId);
      //when this activity is initialized via the constructor,
      // `this.data` represents signal data
      this.context[this.metadata.aid].hook.data = this.data;
      await this.mapJobData();
      await this.serializeMappedData('hook');

      /////// MULTI: START ///////
      const multi = this.engine.store.getMulti();
      await this.saveActivity(multi);
      await this.saveJobData(multi);
      await this.saveActivityStatus(1, multi);
      const multiResponse = await multi.exec();
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

  async serializeMappedData(target: string): Promise<void> {
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

  async subscribeToResponse(): Promise<void> {
    //base `activity` type doesn't execute anything
  }

  async registerTimeout(): Promise<void> {
    //base `activity` type doesn't execute anything
  }

  async execActivity(): Promise<void> {
    //base `activity` type doesn't execute anything
  }

  saveJobMetadata(): boolean {
    return false;
  }

  async saveJobData(multi?: RedisMulti): Promise<void> {
    await this.store.setJob(
      this.context.metadata.jid,
      this.context.data || {},
      this.saveJobMetadata() ? this.context.metadata : {},
      await this.engine.getVID(),
      multi
    );
  }

  async saveActivity(multi?: RedisMulti): Promise<void> {
    const jobId = this.context.metadata.jid;
    const activityId = this.metadata.aid;
    await this.store.setActivity(
      jobId,
      activityId,
      this.context[activityId]?.output?.data || {},
      { ...this.metadata, jid: this.context.metadata.jid, key: this.context.metadata.key },
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
