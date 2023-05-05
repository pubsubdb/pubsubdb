import { StoreService } from '../store';
import { AppVersion } from '../../typedefs/app';
import { ILogger } from '../logger';
import { JobContext } from '../../typedefs/job';
import { HookRule, HookSignal } from '../../typedefs/hook';
import { PubSubDBService as PubSubDB } from '../pubsubdb';

class SignalerService {
  store: StoreService;
  logger: ILogger;
  appVersion: AppVersion;
  pubsubdb: PubSubDB;

  constructor(appVersion: AppVersion, store: StoreService, logger: ILogger, pubsubdb: PubSubDB) {
    this.appVersion = appVersion;
    this.logger = logger;
    this.store = store;
    this.pubsubdb = pubsubdb;
  }

  async getHookRule(topic: string): Promise<HookRule | undefined> {
    const rules = await this.store.getHookRules(await this.pubsubdb.getAppConfig());
    return rules?.[topic]?.[0] as HookRule;
  }

  async register(topic: string, context: JobContext, multi?): Promise<string> {
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
      throw new Error('signaler.register:error: hook rule not found');
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

export { SignalerService };
