import { PubSubDBService } from "..";
import { ActivityData, ActivityMetadata, OpenAPIActivity } from "../../../typedefs/activity";
import { Activity, ActivityType } from "./activity";

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
