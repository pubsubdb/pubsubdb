import { ActivityConfig, ActivityData, ActivityMetadata } from "../../../typedefs/activity";
import { JobContext } from "../../../typedefs/job";
import { RestoreJobContextError, 
         MapInputDataError, 
         SubscribeToResponseError, 
         RegisterTimeoutError, 
         ExecActivityError } from '../../../modules/errors';

class Activity {
  config: ActivityConfig;
  data: ActivityData;
  metadata: ActivityMetadata;
  context: JobContext;

  constructor(config: ActivityConfig, data: ActivityData, metadata: ActivityMetadata) {
    this.config = config;
    this.data = data;
    this.metadata = metadata;
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

export { Activity, ActivityConfig };
