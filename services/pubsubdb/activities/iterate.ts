import { PubSubDBService } from "..";
import { ActivityData, ActivityMetadata, HookData, IterateActivity } from "../../../typedefs/activity";
import { Activity, ActivityType } from "./activity";

class Iterate extends Activity {
  config: IterateActivity;

  constructor(
    config: ActivityType,
    data: ActivityData,
    metadata: ActivityMetadata,
    hook: HookData | null,
    pubsubdb: PubSubDBService
    ) {
      super(config, data, metadata, hook, pubsubdb);
  }

  async restoreJobContext(): Promise<void> {
    console.log("Iterate restoreJobContext - Do nothing; No context");
  }

  async mapInputData(): Promise<void> {
    console.log("Iterate mapInputData - Do nothing; No input data");
  }

  async subscribeToResponse(): Promise<void> {
    console.log("Iterate subscribeToResponse - Do nothing; No response");
  }

  async execActivity(): Promise<void> {
    console.log("Iterate execActivity - Do nothing; No execution");
  }
}

export { Iterate };
