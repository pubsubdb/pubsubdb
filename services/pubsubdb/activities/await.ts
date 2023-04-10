import { ActivityData, ActivityMetadata } from "../../../typedefs/activity";
import { Activity, ActivityType } from "./activity";

class Await extends Activity {
  constructor(config: ActivityType, data: ActivityData, metadata: ActivityMetadata) {
    super(config, data, metadata);
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
