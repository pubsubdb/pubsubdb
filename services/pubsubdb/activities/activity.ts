import { ActivityType, ActivityData, ActivityMetadata } from "../../../typedefs/activity";
import { JobContext } from "../../../typedefs/job";
import { RestoreJobContextError, 
         MapInputDataError, 
         SubscribeToResponseError, 
         RegisterTimeoutError, 
         ExecActivityError } from '../../../modules/errors';
import { PubSubDBService } from "..";
import { Signal } from "../../../typedefs/signal";

/**
 * Both the base class for all activities as well as a class that can be used to create a generic activity.
 * This activity type is useful for precalculating values that might be used repeatedly in a workflow,
 * allowing downstream activities to use the precalculated values instead of recalculating them.
 * 
 * The typical flow for this type of activity is to restore the job context, map in upstream data,
 * get the list of subscription patterns and then publish to trigger downstream activities.
 */
class Activity {
  config: ActivityType;
  data: ActivityData;
  metadata: ActivityMetadata;
  context: JobContext;
  pubsubdb: PubSubDBService;

  constructor(config: ActivityType, data: ActivityData, metadata: ActivityMetadata, pubsubdb: PubSubDBService, context?: JobContext) {
    this.config = config;
    this.data = data;
    this.metadata = metadata;
    this.pubsubdb = pubsubdb;
    this.context = context;
  }

  async process() {
    try {
      await this.restoreJobContext();   //restore job context if not passed in
      await this.mapInputData();        //map upstream data to input data
      await this.subscribeToResponse(); //wait for activity to complete
      await this.saveActivity();        //save activity to db
      await this.subscribeToHook();     //if a hook is declared, subscribe and then sleep; the activity will awaken when the hook is triggered
      await this.registerTimeout();     //add default timeout
      await this.execActivity();        //execute the activity
    } catch (error) {
      console.log('activity process() error', error);
      if (error instanceof RestoreJobContextError) {
        // Handle restoreJobContext error
      } else if (error instanceof MapInputDataError) {
        // Handle mapInputData error
      } else if (error instanceof SubscribeToResponseError) {
        // Handle subscribeToResponse error
      } else if (error instanceof RegisterTimeoutError) {
        // Handle registerTimeout error
      } else if (error instanceof ExecActivityError) {
        // Handle execActivity error
      } else {
        // Handle generic error
      }
    }
  }

  async restoreJobContext(): Promise<void> {
    if(!this.context) {
      //todo: restore job context if not passed in
      throw new RestoreJobContextError();
    } else {
      this.context[this.metadata.aid] = {
        input: {
          data: this.data,
          metadata: this.metadata,
        },
        output: {
          data: {},
          metadata: {},
        },
      };
    }
  }

  async mapInputData(): Promise<void> {
    // Placeholder for mapInputData
  }

  async subscribeToResponse(): Promise<void> {
    // Placeholder for subscribeToResponse
  }

  async registerTimeout(): Promise<void> {
    // Placeholder for registerTimeout
    //throw new RegisterTimeoutError();
  }

  async execActivity(): Promise<void> {
    // Placeholder for execActivity
    //throw new ExecActivityError();
  }

  /**
   * saves activity data; (NOTE: This data represents a subset of the incoming event payload.
   * those fields that are not specified in the mapping rules for other activities will not be saved.)
   */
  async saveActivity(): Promise<void> {
    const jobId = this.context.metadata.jid;
    const activityId = this.metadata.aid;
    await this.pubsubdb.store.setActivity(
      jobId,
      activityId,
      this.context[activityId].output.data,
      { ...this.metadata, jid: jobId, key: this.context.metadata.key },
      this.pubsubdb.getAppConfig()
    );
  }

  async subscribeToHook(): Promise<void> {
    if (this.config.hook) {
      const hook = this.config.hook;
      const signal: Signal = {
        topic: hook.topic,
        resolved: this.context.metadata.jid,
        jobId: this.context.metadata.jid,
      }
      await this.pubsubdb.store.setSignal(signal, this.pubsubdb.getAppConfig());
    }
  }
}

export { Activity, ActivityType };
