import { PubSubDBService } from '..';
import { ActivityData, ActivityMetadata, HookData, RequestActivity } from '../../../typedefs/activity';
import { Activity, ActivityType } from './activity';

class Request extends Activity {
  config: RequestActivity;

  constructor(
    config: ActivityType,
    data: ActivityData,
    metadata: ActivityMetadata,
    hook: HookData | null,
    pubsubdb: PubSubDBService) {
    super(config, data, metadata, hook, pubsubdb);
  }

  async restoreJobContext(): Promise<void> {
    this.pubsubdb.logger.info('Request restoreJobContext - Do nothing; No context');
  }

  async mapInputData(): Promise<void> {
    this.pubsubdb.logger.info('Request mapInputData - Do nothing; No input data');
  }

  async subscribeToResponse(): Promise<void> {
    this.pubsubdb.logger.info('Request subscribeToResponse - Do nothing; No response');
  }

  async execActivity(): Promise<void> {
    this.pubsubdb.logger.info('Request execActivity - Do nothing; No execution');
  }
}

export { Request };
