// import {
//   RestoreJobContextError, 
//   MapInputDataError, 
//   SubscribeToResponseError, 
//   RegisterTimeoutError, 
//   ExecActivityError, 
//   DuplicateActivityError} from '../../../modules/errors';
import { getGuid, getTimeSeries } from '../../modules/utils';
import { Activity } from "./activity";
import { CollatorService } from '../collator';
import { EngineService } from '../engine';
import { Pipe } from "../pipe";
import { ReporterService } from '../reporter';
import {
  ActivityData,
  ActivityMetadata,
  ActivityType,
  TriggerActivity,
  HookData } from "../../typedefs/activity";
import { JobActivityContext } from '../../typedefs/job';
import { RedisMulti } from '../../typedefs/redis';

class Trigger extends Activity {
  config: TriggerActivity;

  constructor(
    config: ActivityType,
    data: ActivityData,
    metadata: ActivityMetadata,
    hook: HookData | null,
    engine: EngineService,
    context?: JobActivityContext) {
      super(config, data, metadata, hook, engine, context);
  }

  async process(): Promise<string> {
    try {
      this.setDuplexLeg(2);
      await this.createContext();
      this.mapJobData();
      await this.setStateNX();
      /////// MULTI:START ///////
      const multi = this.store.getMulti();
      await this.setState(multi);
      await this.setStats(multi);
      await multi.exec();
      /////// MULTI:END ///////
      const activityStatus = this.context.metadata.js;
      const isComplete = CollatorService.isJobComplete(activityStatus);
      this.transition(isComplete);
      return this.context.metadata.jid;
    } catch (error) {
      this.logger.error('trigger-process-failed', error);
      // if (error instanceof DuplicateActivityError) {
      // } else if (error instanceof RestoreJobContextError) {
      // } else if (error instanceof MapInputDataError) {
      // } else if (error instanceof SubscribeToResponseError) {
      // } else if (error instanceof RegisterTimeoutError) {
      // } else if (error instanceof ExecActivityError) {
      // } else {
      // }
      throw error;
    }
  }

  createInputContext(): Partial<JobActivityContext> {
    const input = { 
      [this.metadata.aid]: {
        input: { data: this.data }
      },
      '$self': {
        input: { data: this.data },
        output: { data: this.data }
      },
    } as Partial<JobActivityContext>;
    return input
  }

  async createContext(): Promise<void> {
    const inputContext = this.createInputContext();
    const jobId = this.resolveJobId(inputContext);
    const jobKey = this.resolveJobKey(inputContext);

    //create job context
    const utc = new Date().toISOString();
    const { id, version } = await this.engine.getVID();
    const activityMetadata = { ...this.metadata, jid: jobId, key: jobKey };
    this.context = {
      metadata: {
        ...this.metadata,
        ngn: this.context.metadata.ngn,
        pj: this.context.metadata.pj,
        pa: this.context.metadata.pa,
        app: id,
        vrs: version,
        tpc: this.config.subscribes,
        jid: jobId,
        key: jobKey,
        jc: utc,
        ju: utc,
        ts: getTimeSeries(this.resolveGranularity()),
        js: this.getJobStatus(),
      },
      data: {},
      [this.metadata.aid]: { 
        input: { 
          data: this.data,
          metadata: activityMetadata
        },
        output: { 
          data: this.data,
          metadata: activityMetadata
        },
        settings: { data: {} },
        errors: { data: {} },
       },
    };
    this.context['$self'] = this.context[this.metadata.aid];
  }

  resolveGranularity(): string {
    return ReporterService.DEFAULT_GRANULARITY;
  }

  getJobStatus(): number {
    return this.config.collationKey - this.config.collationInt * 3;
  }

  resolveJobId(context: Partial<JobActivityContext>): string {
    const jobId = this.config.stats?.id;
    return jobId ? Pipe.resolve(jobId, context) : getGuid();
  }

  resolveJobKey(context: Partial<JobActivityContext>): string {
    const jobKey = this.config.stats?.key;
    return jobKey ? Pipe.resolve(jobKey, context) : '';
  }

  async setStateNX(): Promise<void> {
    const jobId = this.context.metadata.jid;
    if (!await this.store.setStateNX(jobId, this.engine.appId)) {
      throw new Error(`Duplicate. Job ${jobId} already exists`);
    }
  }

  async setStats(multi?: RedisMulti): Promise<void> {
    const md = this.context.metadata;
    if (this.config.stats?.measures) {
      const config = await this.engine.getVID();
      const reporter = new ReporterService(config, this.store, this.logger);
      await this.store.setStats(
        md.key,
        md.jid,
        md.ts,
        reporter.resolveTriggerStatistics(this.config, this.context),
        config,
        multi
      );
    }
  }
}

export { Trigger };
