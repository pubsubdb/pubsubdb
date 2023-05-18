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
  AwaitActivity,
  ActivityType,
  HookData
} from "../../../typedefs/activity";
import { JobContext } from "../../../typedefs/job";

class Await extends Activity {
  config: AwaitActivity;

  constructor(
    config: ActivityType,
    data: ActivityData,
    metadata: ActivityMetadata,
    hook: HookData | null,
    pubsubdb: PubSubDBService,
    context?: JobContext) {
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

      await this.execActivity();
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
    const context: JobContext = { 
      data: this.context.data,
      metadata: { 
        ...this.context.metadata,
        pj: this.context.metadata.jid,
        pa: this.metadata.aid
      }
    };
    await this.pubsubdb.pub(
      this.config.subtype,
      this.context.data,
      context
    );
  }


  //********  `RESOLVE` ENTRY POINT (B)  ********//
  //this method is invoked when the job that this job
  //spawned has completed; this.data is the job data
  async resolveAwait(): Promise<void> {
    const jobId = this.context.metadata.jid;
    if (jobId) {
      await this.restoreJobContext(jobId);
      //when this activity is initialized via the constructor,
      // `this.data` represents job data
      this.context[this.metadata.aid].output.data = this.data;
      this.mapJobData(); //persist any data to the job
      await this.serializeMappedData('output');

      /////// MULTI: START ///////
      const multi = this.pubsubdb.store.getMulti();
      await this.saveActivity(multi);
      await this.saveJobData(multi);
      await this.saveActivityStatus(2, multi); //(8-2=6)
      const multiResponse = await multi.exec();
      const activityStatus = multiResponse[multiResponse.length - 1];
      const isComplete = CollatorService.isJobComplete(activityStatus);
      this.transition(isComplete);
      /////// MULTI: END ///////
    } else {
      throw new Error("Await:resolveAwait:jobId is undefined");
    }
  }
}

export { Await };
