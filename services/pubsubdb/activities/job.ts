import { PubSubDBService } from "..";
import { ActivityData, ActivityMetadata, JobActivity } from "../../../typedefs/activity";
import { Activity, ActivityType } from "./activity";

class Job extends Activity {
  config: JobActivity;

  constructor(config: ActivityType, data: ActivityData, metadata: ActivityMetadata, pubsubdb: PubSubDBService) {
    super(config, data, metadata, pubsubdb);
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
