// import {
//   GetStateError, 
//   SetStateError, 
//   MapDataError, 
//   RegisterTimeoutError, 
//   ExecActivityError, 
//   DuplicateActivityError } from '../../../modules/errors';
import { formatISODate, getGuid, getTimeSeries } from '../../modules/utils';
import { Activity } from "./activity";
import { CollatorService } from '../collator';
import { EngineService } from '../engine';
import { Pipe } from "../pipe";
import { ReporterService } from '../reporter';
import { MDATA_SYMBOLS } from '../serializer';
import {
  ActivityData,
  ActivityMetadata,
  ActivityType,
  TriggerActivity } from "../../types/activity";
import { JobState } from '../../types/job';
import { RedisMulti } from '../../types/redis';
import { StringAnyType } from '../../types/serializer';
import { Span, context } from "../../types/telemetry";

class Trigger extends Activity {
  config: TriggerActivity;

  constructor(
    config: ActivityType,
    data: ActivityData,
    metadata: ActivityMetadata,
    hook: ActivityData | null,
    engine: EngineService,
    context?: JobState) {
      super(config, data, metadata, hook, engine, context);
  }

  async process(): Promise<string> {
    let jobSpan: Span;
    let span: Span;
    try {
      this.setDuplexLeg(2);
      await this.getState();
      jobSpan = this.startSpan(1);
      span = this.startSpan(2);
      this.mapJobData();
      await this.setStateNX();
      /////// MULTI:START ///////
      const multi = this.store.getMulti();
      await this.setState(multi);
      await this.setStats(multi);
      await multi.exec();
      /////// MULTI:END ///////
      const complete = CollatorService.isJobComplete(this.context.metadata.js);
      this.transition(complete);
      this.endSpan(span);
      this.endSpan(jobSpan);
      return this.context.metadata.jid;
    } catch (error) {
      this.logger.error('trigger-process-failed', error);
      span && this.endSpan(span);
      jobSpan && this.endSpan(jobSpan);
      // if (error instanceof DuplicateActivityError) {
      // } else if (error instanceof GetStateError) {
      // } else if (error instanceof SetStateError) {
      // } else if (error instanceof MapDataError) {
      // } else if (error instanceof RegisterTimeoutError) {
      // } else if (error instanceof ExecActivityError) {
      // } else {
      // }
      throw error;
    }
  }

  createInputContext(): Partial<JobState> {
    const input = { 
      [this.metadata.aid]: {
        input: { data: this.data }
      },
      '$self': {
        input: { data: this.data },
        output: { data: this.data }
      },
    } as Partial<JobState>;
    return input
  }

  async getState(): Promise<void> {
    const inputContext = this.createInputContext();
    const jobId = this.resolveJobId(inputContext);
    const jobKey = this.resolveJobKey(inputContext);

    //create job context
    const utc = formatISODate(new Date());
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
        trc: this.context.metadata.trc,
        spn: this.context.metadata.spn,
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

  getParentSpanId(leg: number): string | undefined {
    if (leg === 1) {
      return this.context.metadata.spn;
    } else {
      return this.context['$self'].output.metadata.l1s;
    }
  }

  bindJobTelemetryToState(state: StringAnyType): void {
    state['metadata/trc'] = this.context.metadata.trc;
  }

  bindActivityTelemetryToState(state: StringAnyType): void {
    //trigger persists 2 spans when created (`l1s` is the job span, `l2s` is the trigger/activity span)
    state[`${this.metadata.aid}/output/metadata/l1s`] = this.context['$self'].output.metadata.l1s;
    state[`${this.metadata.aid}/output/metadata/l2s`] = this.context['$self'].output.metadata.l2s;
  }

  bindJobMetadataPaths(): string[] {
    return MDATA_SYMBOLS.JOB.KEYS.map((key) => `metadata/${key}`);
  }

  bindActivityMetadataPaths(): string[] {
    return MDATA_SYMBOLS.ACTIVITY.KEYS.map((key) => `output/metadata/${key}`);
  }

  resolveGranularity(): string {
    return ReporterService.DEFAULT_GRANULARITY;
  }

  getJobStatus(): number {
    return this.config.collationKey - this.config.collationInt * 3;
  }

  resolveJobId(context: Partial<JobState>): string {
    const jobId = this.config.stats?.id;
    return jobId ? Pipe.resolve(jobId, context) : getGuid();
  }

  resolveJobKey(context: Partial<JobState>): string {
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
