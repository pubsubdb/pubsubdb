import { RestoreJobContextError, 
         MapInputDataError, 
         SubscribeToResponseError, 
         RegisterTimeoutError, 
         ExecActivityError, 
         DuplicateActivityError} from '../../../modules/errors';
import { PubSubDBService } from "..";
import { ILogger } from "../../logger";
import { SignalerService } from "../../signaler";
import { 
  ActivityType,
  ActivityData,
  ActivityMetadata,
  FlattenedDataObject, 
  HookData} from "../../../typedefs/activity";
import { JobContext } from "../../../typedefs/job";
import { SerializerService } from '../../store/serializer';
import { MapperService } from '../../mapper';

/**
 * The base class for all activities
 */
class Activity {
  config: ActivityType;
  data: ActivityData;
  metadata: ActivityMetadata;
  hook: HookData;
  context: JobContext;
  pubsubdb: PubSubDBService;
  logger: ILogger;

  constructor(
    config: ActivityType,
    data: ActivityData,
    metadata: ActivityMetadata,
    hook: HookData | null,
    pubsubdb: PubSubDBService,
    context?: JobContext) {
      this.config = config;
      this.data = data;
      this.metadata = metadata;
      this.hook = hook;
      this.pubsubdb = pubsubdb;
      this.logger = this.pubsubdb.logger;
      this.context = context || { data: {}, metadata: {} } as JobContext;
  }

  //********  INITIAL ENTRY POINT (A)  ********//
  async process(): Promise<string> {
    //try {
      await this.restoreJobContext(this.context.metadata.jid);
      await this.mapJobData();

      /////// MULTI: START ///////
      const multi = this.pubsubdb.store.getMulti();
      //await this.mapInputData();     //subclasses implement this
      //await this.registerResponse(); //subclasses implement this
      //await this.registerTimeout();  //subclasses implement this
      await this.saveActivity(multi);
      const shouldSleep = await this.registerExpectedHook(multi);
      const decrementBy = shouldSleep ? 4 : 3;
      await this.saveActivityStatus(decrementBy, multi);
      //await this.saveJob(multi);
      await multi.exec();
      /////// MULTI: END ///////

      //await this.execActivity();      //subclasses implement this
      !shouldSleep && this.pub();       //spawn downstream activities
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
  async registerExpectedHook(multi?): Promise<string | void> {
    if (this.config.hook?.topic) {
      const signalerService = new SignalerService(
        await this.pubsubdb.getAppConfig(),
        this.pubsubdb.store,
        this.pubsubdb.logger,
        this.pubsubdb
      );
      return await signalerService.register(this.config.hook.topic, this.context, multi);
    }
  }
  async processHookSignal(): Promise<void> {
    const signalerService = new SignalerService(
      await this.pubsubdb.getAppConfig(),
      this.pubsubdb.store,
      this.pubsubdb.logger,
      this.pubsubdb
    );
    const jobId = await signalerService.process(this.config.hook.topic, this.data);
    if (jobId) {
      await this.restoreJobContext(jobId);
      //when this activity is initialized via the constructor,
      // `this.data` represents signal data
      this.context[this.metadata.aid].hook.data = this.data;
      await this.mapJobData();
      await this.serializeMappedData('hook');

      /////// MULTI: START ///////
      const multi = this.pubsubdb.store.getMulti();
      await this.saveActivity(multi);
      await this.saveJob(multi);
      await this.saveActivityStatus(1, multi);
      await multi.exec();
      /////// MULTI: END ///////

      this.pub();
    }
  }

  async restoreJobContext(jobId: string): Promise<void> {
    const config = await this.pubsubdb.getAppConfig();
    this.context = await this.pubsubdb.store.restoreContext(
      jobId,
      this.config.depends,
      config
    ) as JobContext;
    if (!this.context[this.metadata.aid]) {
      this.context[this.metadata.aid] = { data: {}, metadata: {}, hook: {} };
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

  async mapJobData(): Promise<void> {
    if(this.config.job?.maps) {
      const mapper = new MapperService(this.config.job.maps, this.context);
      this.context.data = await mapper.mapRules();
    }
  }

  async mapInputData(): Promise<void> {
    //todo: implement, since common to all subclasses
  }

  async subscribeToResponse(): Promise<void> {
    //base `activity` type doesn't execute anything
    //`async` and `openapi` subtypes will override this method
  }

  async registerTimeout(): Promise<void> {
    //base `activity` type doesn't execute anything
    //`async` and `openapi` subtypes will override this method
  }

  async execActivity(): Promise<void> {
    //base `activity` type doesn't execute anything
    //`async` and `openapi` subtypes will override this method
  }

  saveJobMetadata(): boolean {
    return false;
  }

  async saveJob(multi?: any): Promise<void> {
    const jobId = this.context.metadata.jid;
    await this.pubsubdb.store.setJob(
      jobId,
      this.context.data,
      this.saveJobMetadata() ? this.context.metadata : {},
      await this.pubsubdb.getAppConfig(),
      multi
    );
  }

  async saveActivity(multi?): Promise<void> {
    const jobId = this.context.metadata.jid;
    const activityId = this.metadata.aid;
    await this.pubsubdb.store.setActivity(
      jobId,
      activityId,
      this.context[activityId]?.output?.data || {},
      { ...this.metadata, jid: this.context.metadata.jid, key: this.context.metadata.key },
      this.context[activityId]?.hook?.data || {},
      await this.pubsubdb.getAppConfig(),
      multi,
    );
  }

  async saveActivityStatus(multiplier = 1, multi?): Promise<void> {
    await this.pubsubdb.store.updateJobStatus(
      this.context.metadata.jid,
      -this.config.collationInt * multiplier,
      await this.pubsubdb.getAppConfig(),
      multi
    );
  }

  async pub(): Promise<void> {
    const transitions = await this.pubsubdb.store.getTransitions(await this.pubsubdb.getAppConfig());
    const transition = transitions[`.${this.metadata.aid}`];
    if (transition) {
      for (const p in transition) {
        await this.pubsubdb.pub(
          `.${p}`,
          {},
          this.context
        );
      }
    }
  }
}

export { Activity, ActivityType };
