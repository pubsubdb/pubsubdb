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

  async restoreJobContext(): Promise<void> {
    this.logger.info('Request restoreJobContext - Do nothing; No context');
  }

  async mapInputData(): Promise<void> {
    this.logger.info('Request mapInputData - Do nothing; No input data');
  }

  async subscribeToResponse(): Promise<void> {
    this.logger.info('Request subscribeToResponse - Do nothing; No response');
  }

  async execActivity(): Promise<void> {
    this.logger.info('Request execActivity - Do nothing; No execution');
  }
}

export { Request };
