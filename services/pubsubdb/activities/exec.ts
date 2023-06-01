// import { RestoreJobContextError, 
//          MapInputDataError, 
//          SubscribeToResponseError, 
//          RegisterTimeoutError, 
//          ExecActivityError, 
//          DuplicateActivityError} from '../../../modules/errors';
import { CollatorService } from "../../collator";
import { PubSubDBService } from "..";
import { Activity } from "./activity";
import {
  ActivityData,
  ActivityMetadata,
  ExecActivity,
  ActivityType,
  HookData
} from "../../../typedefs/activity";
import { JobActivityContext } from "../../../typedefs/job";
import { StreamData, StreamStatus } from "../../../typedefs/stream";
import { KeyType } from "../../../modules/key";

class Exec extends Activity {
  config: ExecActivity;

  constructor(
    config: ActivityType,
    data: ActivityData,
    metadata: ActivityMetadata,
    hook: HookData | null,
    pubsubdb: PubSubDBService,
    context?: JobActivityContext) {
      super(config, data, metadata, hook, pubsubdb, context);
  }

  //********  INITIAL ENTRY POINT (A)  ********//
  async process(): Promise<string> {
    //try {
      await this.restoreJobContext(this.context.metadata.jid);

      /////// MULTI: START ///////
      const multi = this.pubsubdb.store.getMulti();
      this.mapInputData();
      //todo: await this.registerTimeout();
      await this.saveActivity(multi);
      await this.saveActivityStatus(1, multi);
      await multi.exec();
      /////// MULTI: END ///////

      await this.execWorkStream();
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

  async execWorkStream(): Promise<void> {
    const streamData: StreamData = {
      metadata: {
        jid: this.context.metadata.jid,
        aid: this.metadata.aid,
        topic: this.config.subtype,
      },
      data: this.context.data
    };
    const key = this.pubsubdb.store?.mintKey(KeyType.STREAMS, { appId: this.pubsubdb.appId, topic: this.config.subtype });
    this.pubsubdb.streamSignaler?.publishMessage(key, streamData);
  }


  //********  `RESOLVE` ENTRY POINT (B)  ********//
  //remote adapter responses are published and routed here
  async processWorkerResponse(status: StreamStatus): Promise<void> {
    await this.restoreJobContext(this.context.metadata.jid);
    this.context[this.metadata.aid].output.data = this.data;
    this.mapJobData();
    await this.serializeMappedData('output');
    //******      MULTI: START      ******//
    const multi = this.pubsubdb.store.getMulti();
    await this.saveActivity(multi);
    await this.saveJobData(multi);
    if (status === StreamStatus.PENDING) {
      await multi.exec();
    } else {
      if (status === StreamStatus.ERROR) {
        //todo: save error data (e/)
        await this.saveActivityStatus(1, multi); //(8-1=7)
      } else {
        //todo: save job data (d/)
        await this.saveActivityStatus(2, multi); //(8-2=6)
      } 
      const multiResponse = await multi.exec();
      //******       MULTI: END       ******//
      const activityStatus = multiResponse[multiResponse.length - 1];
      const isComplete = CollatorService.isJobComplete(activityStatus as number);
      this.transition(isComplete);
    }
  }
}

export { Exec };
