import { PubSubDBService } from "..";
import { ActivityData, ActivityMetadata, HookData, RequestActivity } from "../../../typedefs/activity";
import { Activity, ActivityType } from "./activity";

class Request extends Activity {
  config: RequestActivity;

  constructor(
    config: ActivityType,
    data: ActivityData,
    metadata: ActivityMetadata,
    hook: HookData | null,
    pubsubdb: PubSubDBService) {
    super(config, data, metadata, hook, pubsubdb);
  }

  async restoreJobContext(): Promise<void> {
    console.log("Request restoreJobContext - Do nothing; No context");
  }

  async mapInputData(): Promise<void> {
    console.log("Request mapInputData - Do nothing; No input data");
  }

  async subscribeToResponse(): Promise<void> {
    console.log("Request subscribeToResponse - Do nothing; No response");
  }

  async execActivity(): Promise<void> {
    console.log("Request execActivity - Do nothing; No execution");
  }
}

export { Request };
