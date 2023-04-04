import { Activity, ActivityConfig } from "./activity";

class Trigger extends Activity {
  constructor(config: ActivityConfig, data: any) {
    super(config, data);
  }

 async restoreJobContext(): Promise<void> {
    // Override implementation for restoreJobContext in Trigger
    console.log('Trigger restoreJobContext - Do nothing; No context');
  }

 async mapInputData(): Promise<void> {
    // Override implementation for mapInputData in Trigger
    console.log('Trigger mapInputData - Do nothing; No input data');
  }

 async subscribeToResponse(): Promise<void> {
    // Override implementation for subscribeToResponse in Trigger
    console.log('Trigger subscribeToResponse - Do nothing; No response');
  }

 async execActivity(): Promise<void> {
    // Override implementation for execActivity in Trigger
    console.log('Trigger execActivity - Do nothing; No execution');
  }
}

export { Trigger };
