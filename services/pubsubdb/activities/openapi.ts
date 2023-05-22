import { PubSubDBService } from '..';
import { ActivityData, ActivityMetadata, HookData, OpenAPIActivity } from '../../../typedefs/activity';
import { Activity, ActivityType } from './activity';

/**
 * the openapi activity type orchestrates external endpoints as documented by openapi.
 */
class OpenApi extends Activity {
  config: OpenAPIActivity;

  constructor(
    config: ActivityType,
    data: ActivityData,
    metadata: ActivityMetadata,
    hook: HookData | null,
    pubsubdb: PubSubDBService
    ) {
      super(config, data, metadata, hook, pubsubdb);
  }
  
  async restoreJobContext(): Promise<void> {
    this.pubsubdb.logger.info('OpenApi restoreJobContext - Do nothing; No context');
  }

  async mapInputData(): Promise<void> {
    this.pubsubdb.logger.info('OpenApi mapInputData - Do nothing; No input data');
  }

  async subscribeToResponse(): Promise<void> {
    this.pubsubdb.logger.info('OpenApi subscribeToResponse - Do nothing; No response');
  }

  async execActivity(): Promise<void> {
    this.pubsubdb.logger.info('OpenApi execActivity - Do nothing; No execution');
  }
}

export { OpenApi };
