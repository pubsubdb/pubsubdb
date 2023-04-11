import { ActivityType, ActivityData, ActivityMetadata } from "../../../typedefs/activity";
import { JobContext } from "../../../typedefs/job";
import { RestoreJobContextError, 
         MapInputDataError, 
         SubscribeToResponseError, 
         RegisterTimeoutError, 
         ExecActivityError } from '../../../modules/errors';
import { PubSubDBService } from "..";

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

  constructor(config: ActivityType, data: ActivityData, metadata: ActivityMetadata, pubsubdb: PubSubDBService) {
    this.config = config;
    this.data = data;
    this.metadata = metadata;
    this.pubsubdb = pubsubdb;
  }

  async process() {
    try {
      await this.restoreJobContext();
      await this.mapInputData();
      await this.subscribeToResponse();
      await this.registerTimeout();
      await this.execActivity();
    } catch (error) {
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

    // Placeholder for restoreJobContext
    throw new RestoreJobContextError();
  }

  async mapInputData(): Promise<void> {
    // Placeholder for mapInputData
    throw new MapInputDataError();
  }

  async subscribeToResponse(): Promise<void> {
    // Placeholder for subscribeToResponse
    throw new SubscribeToResponseError();
  }

  async registerTimeout(): Promise<void> {
    // Placeholder for registerTimeout
    throw new RegisterTimeoutError();
  }

  async execActivity(): Promise<void> {
    // Placeholder for execActivity
    throw new ExecActivityError();
  }
}

export { Activity, ActivityType };
