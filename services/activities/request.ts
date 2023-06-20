import { EngineService } from '../engine';
import { Activity, ActivityType } from './activity';
import { ActivityData, ActivityMetadata, HookData, RequestActivity } from '../../typedefs/activity';

class Request extends Activity {
  config: RequestActivity;

  constructor(
    config: ActivityType,
    data: ActivityData,
    metadata: ActivityMetadata,
    hook: HookData | null,
    engine: EngineService) {
    super(config, data, metadata, hook, engine);
  }

  async mapInputData(): Promise<void> {
    this.logger.info('request-map-input-data');
  }
}

export { Request };
