// OpenApi.ts
import { Activity, ActivityConfig } from "./activity";

class OpenApi extends Activity {
  constructor(config: ActivityConfig, data: any) {
    super(config, data);
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
