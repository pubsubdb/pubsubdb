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
      this.setDuplexLeg(1);
      await this.getState();
      this.mapInputData();
      /////// MULTI: START ///////
      const multi = this.store.getMulti();
      //todo: await this.registerTimeout();
      await this.setState(multi);
      await this.setStatus(1, multi);
      await multi.exec();
      /////// MULTI: END ///////
      await this.execActivity(); //todo: store a back-ref to the spawned jobid
      return this.context.metadata.aid;
    //} catch (error) {
      //this.logger.error('await-process-failed', error);
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
  //this method is invoked when the job spawned by this job ends;
  //`this.data` is the job data produced by the spawned job
  async resolveAwait(status: StreamStatus = StreamStatus.SUCCESS, code: StreamCode = 200): Promise<void> {
    const jid = this.context.metadata.jid;
    const aid = this.metadata.aid;
    if (!jid) {
      throw new Error("service/activities/await:resolveAwait: missing jid in job context");
    }
    this.logger.debug('await-onresponse-started', { jid, aid, status, code });
    this.status = status;
    this.code = code;
    await this.getState();
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
    //******      MULTI: START      ******//
    const multi = this.store.getMulti();
    await this.setState(multi);
    await this.setStatus(2, multi);
    return await multi.exec() as MultiResponseFlags;
    //******       MULTI: END       ******//
  }

  async processError(): Promise<MultiResponseFlags> {
    this.bindActivityError(this.data);
    //******      MULTI: START      ******//
    const multi = this.store.getMulti();
    await this.setState(multi);
    await this.setStatus(1, multi);
    return await multi.exec() as MultiResponseFlags;
    //******       MULTI: END       ******//
  }
}

export { Await };
