// import { RestoreJobContextError, 
//          MapInputDataError, 
//          SubscribeToResponseError, 
//          RegisterTimeoutError, 
//          ExecActivityError, 
//          DuplicateActivityError} from '../../../modules/errors';
import { KeyType } from "../../modules/key";
import { Activity } from "./activity";
import { CollatorService } from "../collator";
import { EngineService } from "../engine";
import {
  ActivityData,
  ActivityMetadata,
  ExecActivity,
  ActivityType,
  HookData
} from "../../typedefs/activity";
import { JobActivityContext } from "../../typedefs/job";
import { MultiResponseFlags } from "../../typedefs/redis";
import {
  StreamCode,
  StreamData,
  StreamStatus } from "../../typedefs/stream";

class Exec extends Activity {
  config: ExecActivity;

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
      await this.execActivity(); //todo: store a backref to the spawned stream id?
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
    const streamData: StreamData = {
      metadata: {
        jid: this.context.metadata.jid,
        aid: this.metadata.aid,
        topic: this.config.subtype,
      },
      data: this.context.data
    };
    if (this.config.retry) {
      streamData.policies = {
        retry: this.config.retry
      };
    }
    const key = this.store?.mintKey(KeyType.STREAMS, { appId: this.engine.appId, topic: this.config.subtype });
    this.engine.streamSignaler?.publishMessage(key, streamData);
  }


  //********  `WORKER RESPONSE` RE-ENTRY POINT (B)  ********//
  async processWorkerResponse(status: StreamStatus = StreamStatus.SUCCESS, code: StreamCode = 200): Promise<void> {
    this.logger.info(`process exec response`, { status, code });
    this.status = status;
    this.code = code;
    await this.restoreJobContext(this.context.metadata.jid);
    let multiResponse: MultiResponseFlags = [];
    if (status === StreamStatus.PENDING) {
      await this.processPending();
    } else {
      multiResponse = status === StreamStatus.SUCCESS ?
        await this.processSuccess():
        await this.processError();
      const activityStatus = multiResponse[multiResponse.length - 1];
      const isComplete = CollatorService.isJobComplete(activityStatus as number);
      this.transition(isComplete);
    }
  }

  async processPending(): Promise<MultiResponseFlags> {
    this.bindActivityData('output');
    this.mapJobData();
    this.mapActivityData('output');
    //******      MULTI: START      ******//
    const multi = this.store.getMulti();
    await this.saveActivity(multi);
    await this.saveJob(multi);
    return await multi.exec() as MultiResponseFlags;
    //******       MULTI: END       ******//
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

export { Exec };
