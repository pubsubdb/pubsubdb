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
      await this.execActivity(); //todo: store a backref to the spawned stream id?
      return this.context.metadata.aid;
    //} catch (error) {
      //this.logger.error('exec-process-failed', error);
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
    const jid = this.context.metadata.jid;
    const aid = this.metadata.aid;
    this.logger.debug('exec-onresponse-started', { jid, aid, status, code });
    this.status = status;
    this.code = code;
    await this.getState();
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
    //******      MULTI: START      ******//
    const multi = this.store.getMulti();
    await this.setState(multi);
    return await multi.exec() as MultiResponseFlags;
    //******       MULTI: END       ******//
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

export { Exec };
