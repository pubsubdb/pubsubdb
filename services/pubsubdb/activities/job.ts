import { PubSubDBService } from "..";
import { ActivityData, ActivityMetadata, JobActivity } from "../../../typedefs/activity";
import { JobContext } from "../../../typedefs/job";
import { Activity, ActivityType } from "./activity";

class Job extends Activity {
  config: JobActivity;

  constructor(config: ActivityType, data: ActivityData, metadata: ActivityMetadata, pubsubdb: PubSubDBService, context: JobContext) {
    super(config, data, metadata, pubsubdb, context);
  }

  async mapJobData(): Promise<void> {
    console.log("Job mapInputData - Do nothing; No input data");
  }

  async execActivity(): Promise<void> {
    console.log("Job execActivity - Do nothing; No execution");
  }
}

export { Job };
