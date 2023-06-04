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

  async restoreJobContext(): Promise<void> {
    this.logger.info('Iterate restoreJobContext - Do nothing; No context');
  }

  async mapInputData(): Promise<void> {
    this.logger.info('Iterate mapInputData - Do nothing; No input data');
  }

  async subscribeToResponse(): Promise<void> {
    this.logger.info('Iterate subscribeToResponse - Do nothing; No response');
  }

  async execActivity(): Promise<void> {
    this.logger.info('Iterate execActivity - Do nothing; No execution');
  }
}

export { Iterate };
