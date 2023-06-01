import { ILogger } from '../logger';
import { PubSubDBService as PubSubDB } from '../pubsubdb';
import { StoreService } from '../store';
import { AppVersion } from '../../typedefs/app';
import { HookRule, HookSignal } from '../../typedefs/hook';
import { JobActivityContext } from '../../typedefs/job';
import { RedisClient, RedisMulti } from '../../typedefs/redis';

class StoreSignaler {
  store: StoreService<RedisClient, RedisMulti>;
  logger: ILogger
  appVersion: AppVersion;
  pubsubdb: PubSubDB;

  constructor(appVersion: AppVersion, pubsubdb: PubSubDB) {
    this.appVersion = appVersion;
    this.pubsubdb = pubsubdb;
    this.store = pubsubdb.store;
    this.logger = pubsubdb.logger;
  }

  async getHookRule(topic: string): Promise<HookRule | undefined> {
    const rules = await this.store.getHookRules(await this.pubsubdb.getAppConfig());
    return rules?.[topic]?.[0] as HookRule;
  }

  async registerHook(topic: string, context: JobActivityContext, multi?: RedisMulti): Promise<string> {
    const hookRule = await this.getHookRule(topic);
    if (hookRule) {
      const jobId = context.metadata.jid;
      const hook: HookSignal = {
        topic,
        resolved: jobId,
        jobId,
      }
      await this.store.setHookSignal(hook, this.appVersion, multi);
      return jobId;
    } else {
      throw new Error('signaler.registerHook:error: hook rule not found');
    }
  }

  async process(topic: string, data: Record<string, unknown>): Promise<string> {
    const hookRule = await this.getHookRule(topic);
    if (hookRule) {
      //todo: use the rule to generate `resolved`
      const resolved = (data as { id: string}).id;
      const jobId = await this.store.getHookSignal(topic, resolved, this.appVersion);
      return jobId;
    } else {
      throw new Error('signaler.process:error: hook rule not found');
    }
  }
}

export { StoreSignaler };
