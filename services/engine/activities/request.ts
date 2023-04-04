// Request.ts
import { Activity, ActivityConfig } from "./activity";

class Request extends Activity {
  constructor(config: ActivityConfig, data: any) {
    super(config, data);
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
