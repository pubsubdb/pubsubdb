import { PubSubDBService } from "..";
import { ActivityData, ActivityMetadata, OpenAPIActivity } from "../../../typedefs/activity";
import { Activity, ActivityType } from "./activity";

/**
 * the openapi activity type is a placeholder for actions that are external to pubsubdb.
 * Use this activity to call external APIs, or to call other pubsubdb instances/apps.
 * 
 * Once the call is made to the external entity, the activity will register with the
 * global hooks table for the specific payload/event that can awaken it. This works,
 * because there is a hooks pattern that is used to register and awaken activities.
 * it generates a skeleton key like hash query and if any of the keys fit, it deletes the
 * key and resumes the job in context.
 */

class OpenApi extends Activity {
  config: OpenAPIActivity;

  constructor(config: ActivityType, data: ActivityData, metadata: ActivityMetadata, pubsubdb: PubSubDBService) {
    super(config, data, metadata, pubsubdb);
  }
  
  async restoreJobContext(): Promise<void> {
    console.log("OpenApi restoreJobContext - Do nothing; No context");
  }

  async mapInputData(): Promise<void> {
    console.log("OpenApi mapInputData - Do nothing; No input data");
  }

  async subscribeToResponse(): Promise<void> {
    console.log("OpenApi subscribeToResponse - Do nothing; No response");
  }

  async execActivity(): Promise<void> {
    console.log("OpenApi execActivity - Do nothing; No execution");
  }
}

export { OpenApi };
