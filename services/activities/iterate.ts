import { EngineService } from '../engine';
import { Activity, ActivityType } from './activity';
import { ActivityData, ActivityMetadata, HookData, IterateActivity } from '../../typedefs/activity';

class Iterate extends Activity {
  config: IterateActivity;

  constructor(
    config: ActivityType,
    data: ActivityData,
    metadata: ActivityMetadata,
    hook: HookData | null,
    engine: EngineService
    ) {
      super(config, data, metadata, hook, engine);
  }

  async mapInputData(): Promise<void> {
    this.logger.info('iterate-map-input-data');
  }
}

export { Iterate };
