import { PubSubDBService } from "..";
import { ActivityData, ActivityMetadata, AwaitActivity, HookData } from "../../../typedefs/activity";
import { Activity, ActivityType } from "./activity";

class Await extends Activity {
  config: AwaitActivity;

  constructor(
    config: ActivityType,
    data: ActivityData,
    metadata: ActivityMetadata,
    hook: HookData | null,
    pubsubdb: PubSubDBService) {
      super(config, data, metadata, hook, pubsubdb);
  }

  async restoreJobContext(): Promise<void> {
    console.log("Await restoreJobContext - Do nothing; No context");
  }

  async mapInputData(): Promise<void> {
    console.log("Await mapInputData - Do nothing; No input data");
  }

  async subscribeToResponse(): Promise<void> {
    console.log("Await subscribeToResponse - Do nothing; No response");
  }

  async execActivity(): Promise<void> {
    console.log("Await execActivity - Do nothing; No execution");
  }
}

export { Await };
