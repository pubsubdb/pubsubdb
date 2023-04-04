// Await.ts
import { Activity, ActivityConfig } from "./activity";

class Await extends Activity {
  constructor(config: ActivityConfig, data: any) {
    super(config, data);
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
