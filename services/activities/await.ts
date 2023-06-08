// import { RestoreJobContextError, 
//          MapInputDataError, 
//          SubscribeToResponseError, 
//          RegisterTimeoutError, 
//          ExecActivityError, 
//          DuplicateActivityError} from '../../../modules/errors';
import { Activity } from "./activity";
import { CollatorService } from "../collator";
import { EngineService } from "../engine";
import {
  ActivityData,
  ActivityMetadata,
  AwaitActivity,
  ActivityType,
  HookData
} from "../../typedefs/activity";
import { JobActivityContext } from "../../typedefs/job";
import { MultiResponseFlags } from "../../typedefs/redis";
import { StreamCode, StreamStatus } from "../../typedefs/stream";

class Await extends Activity {
  config: AwaitActivity;

  constructor(
    config: ActivityType,
    data: ActivityData,
    metadata: ActivityMetadata,
    hook: HookData | null,
    engine: EngineService,
    context?: JobActivityContext) {
      super(config, data, metadata, hook, engine, context);
  }

  //********  INITIAL ENTRY POINT (A)  ********//
  async process(): Promise<string> {
    //try {
      await this.restoreJobContext(this.context.metadata.jid);
      this.mapInputData();
      /////// MULTI: START ///////
      const multi = this.store.getMulti();
      //todo: await this.registerTimeout();
      await this.saveActivity(multi);
      await this.saveActivityStatus(1, multi);
      await multi.exec();
      /////// MULTI: END ///////
      await this.execActivity(); //todo: store a back-ref to the spawned jobid
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

  async execActivity(): Promise<void> {
    const context: JobActivityContext = { 
      data: this.context.data,
      metadata: { 
        ...this.context.metadata,
        ngn: undefined,
        pj: this.context.metadata.jid,
        pa: this.metadata.aid
      }
    };
    await this.engine.pub(
      this.config.subtype,
      this.context.data,
      context
    );
  }


  //********  `RESOLVE` ENTRY POINT (B)  ********//
  //this method is invoked when the job that this job
  //spawned has completed; this.data is the job data
  async resolveAwait(status: StreamStatus = StreamStatus.SUCCESS, code: StreamCode = 200): Promise<void> {
    this.logger.info('processing await response', { status, code });
    if (!this.context.metadata.jid) {
      throw new Error("service/activities/await:resolveAwait: missing jid in job context");
    }
    this.status = status;
    this.code = code;
    await this.restoreJobContext(this.context.metadata.jid);
    let multiResponse: MultiResponseFlags = [];
    if (status === StreamStatus.SUCCESS) {
      multiResponse = await this.processSuccess();
    } else {
      multiResponse = await this.processError();
    }
    const activityStatus = multiResponse[multiResponse.length - 1];
    const isComplete = CollatorService.isJobComplete(activityStatus as number);
    this.transition(isComplete);
  }

  async processSuccess(): Promise<MultiResponseFlags> {
    this.bindActivityData('output');
    this.mapJobData();
    this.mapActivityData('output');
    //******      MULTI: START      ******//
    const multi = this.store.getMulti();
    await this.saveActivity(multi);
    await this.saveJob(multi);
    await this.saveActivityStatus(2, multi); //(8-2=6)
    return await multi.exec() as MultiResponseFlags;
    //******       MULTI: END       ******//
  }

  async processError(): Promise<MultiResponseFlags> {
    this.bindActivityError(this.data);
    //******      MULTI: START      ******//
    const multi = this.store.getMulti();
    await this.saveActivity(multi);
    await this.saveJob(multi);
    await this.saveActivityStatus(1, multi); //(8-1=7)
    return await multi.exec() as MultiResponseFlags;
    //******       MULTI: END       ******//
  }
}

export { Await };
