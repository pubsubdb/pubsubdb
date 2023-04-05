import { ActivityData, ActivityMetadata } from "../../../typedefs/activity";
import { Activity, ActivityConfig } from "./activity";

class Trigger extends Activity {
  constructor(config: ActivityConfig, data: ActivityData, metadata: ActivityMetadata) {
    super(config, data, metadata);
  }

  /**
   * Trigger does not have a job context to restore; it creates the job context
   */
  async restoreJobContext(): Promise<void> {
    await this.createJob();
  }

  /**
   * Create a new job for the Trigger activity.
   * @returns {Promise<void>} A promise that resolves when the job is created.
   */
  async createJob(): Promise<void> {
    //0) generate the job guid using graph rules
    //1) create a new job context (the functional scope of the job)
    this.context = {
      data: {},
      metadata: {
        id: this.metadata.id,
      },
    }
  }

  /**
   * Triggers do not map input data; however, the request class does in order to merge
   * values provided in the header, query, or path with the payload body. This allows
   * for GET requests to have a body. The 'request' activity is responsible would include
   * a mapping file associated with its output data.
   * @returns {Promise<void>} A promise that resolves when the input data mapping is done.
   */
  async mapInputData(): Promise<void> {
    return;
  }

  /**
   * Every activity has a two-part lifectycle: generate request; subscribe to response.
   * Trigger does not generate a request (the caller does); therefore, the trigger
   * only handles part 2 of the lifecycle: subscribe to response.
   * @returns {Promise<void>} A promise that resolves when the response subscription is done.
   */
  async subscribeToResponse(): Promise<void> {
    return;
  }

  /**
   * Perform all trigger-specific actions to execute the activity.
   * @returns {Promise<void>} A promise that resolves when the activity execution is done.
   */
  async execActivity(): Promise<void> {
    
  }
}

export { Trigger };
