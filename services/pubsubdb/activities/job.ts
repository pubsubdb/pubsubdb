import { ActivityData, ActivityMetadata } from "../../../typedefs/activity";
import { Activity, ActivityConfig } from "./activity";

class Job extends Activity {
  constructor(config: ActivityConfig, data: ActivityData, metadata: ActivityMetadata) {
    super(config, data, metadata);
  }
  async restoreJobContext(): Promise<void> {
    console.log("Job restoreJobContext - Do nothing; No context");
  }

  async mapInputData(): Promise<void> {
    console.log("Job mapInputData - Do nothing; No input data");
  }

  async subscribeToResponse(): Promise<void> {
    console.log("Job subscribeToResponse - Do nothing; No response");
  }

  async execActivity(): Promise<void> {
    console.log("Job execActivity - Do nothing; No execution");
  }
}

export { Job };
