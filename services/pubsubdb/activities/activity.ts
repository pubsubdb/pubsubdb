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

      /////// MULTI ///////
      const multi = await this.pubsubdb.store.getMulti();
      await this.saveActivity(multi);        //save activity to db
      await this.saveActivityStatus(multi);  //save activity status (-1)
      await this.subscribeToHook(multi);     //if a hook is declared, subscribe and then sleep; the activity will awaken when the hook is triggered
      await multi.exec();
      /////// MULTI ///////

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
   * updates the collation key for the job by subtracting the activity's position from
   * the 15-digit collation key. For example, if the collation key is 999999999999900
   * and the activity is the 3rd in the list (and the multipler is 1),
   * then the collation key will be updated to 998999999999900.
   * This means that the activity is running. When an activity completes, 2 will be subtracted.
   * @param {number} position - between 0 and 14 inclusive
   * @param {number} multiplier - binary flag (1 pending, 2 complete, 4 bypassed, 8 error) that indicates the activity's status
   * @returns 
   */
  getActivitySubtractionValue(multiplier: 1|2|3|4 = 1): number {
    const position = this.config.sortedActivityPosition
    if (position < 0 || position > 14) {
      throw new Error('Invalid position. Must be between 0 and 14, inclusive.');
    }
    const targetLength = 15;
    return Math.pow(10, targetLength - position - 1) * multiplier;
  }

  /**
   * saves activity data; (NOTE: This data represents a subset of the incoming event payload.
   * those fields that are not specified in the mapping rules for other activities will not be saved.)
   */
  async saveActivity(multi?): Promise<void> {
    const jobId = this.context.metadata.jid;
    const activityId = this.metadata.aid;
    await this.pubsubdb.store.setActivity(
      jobId,
      activityId,
      this.context[activityId].output.data,
      { ...this.metadata,
        jid: jobId,
        key: this.context.metadata.key
      },
      this.pubsubdb.getAppConfig(),
      multi,
    );
  }

  /**
   * update the job collatin key to indicate that the activity is running (1)
   * @param multi 
   */
  async saveActivityStatus(multi?): Promise<void> {
    await this.pubsubdb.store.updateJobStatus(
      this.context.metadata.jid,
      -this.getActivitySubtractionValue(),
      this.pubsubdb.getAppConfig(),
      multi
    );
  }

  /**
   * if this activity has `hook` config, it means it should sleep and NOT publish
   * to activate the next downstream activity. only the key that is generated by this method
   * will awaken the activity.
   * 
   * TODO: construct the key (and/or gate) in a way that is unique to the activity
   * 
   * @example
   * hooks:
   *   lob.1.order.routed:
   *     - to: route
   *       conditions:
   *         gate: and
   *         match:
   *           - expected: "{schedule.output.data.id}"
   *             actual: "{$self.hook.data.id}"
   * 
   * @param multi 
   */
  async subscribeToHook(multi?): Promise<void> {
    if (this.config.hook) {
      const hook = this.config.hook;
      const signal: Signal = {
        topic: hook.topic,
        resolved: this.context.metadata.jid,
        jobId: this.context.metadata.jid,
      }
      await this.pubsubdb.store.setSignal(signal, this.pubsubdb.getAppConfig(), multi);
    }
  }
}

export { Activity, ActivityType };
