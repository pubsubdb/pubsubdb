import { DuplicateJobError } from '../../modules/errors';
import { formatISODate, getGuid, getTimeSeries } from '../../modules/utils';
import { Activity } from './activity';
import { CollatorService } from '../collator';
import { EngineService } from '../engine';
import { Pipe } from '../pipe';
import { ReporterService } from '../reporter';
import { MDATA_SYMBOLS } from '../serializer';
import {
  ActivityData,
  ActivityMetadata,
  ActivityType,
  TriggerActivity } from '../../types/activity';
import { JobState } from '../../types/job';
import { RedisMulti } from '../../types/redis';
import { StringAnyType } from '../../types/serializer';
import { Span, SpanStatusCode } from '../../types/telemetry';

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
      const spanName = `JOB/${this.engine.appId}/${this.config.subscribes}/1`;
      jobSpan = this.startSpan(1, spanName);
      span = this.startSpan(2);
      this.mapJobData();
      await this.setStateNX();

      const multi = this.store.getMulti();
      await this.setState(multi);
      await this.setStats(multi);
      await multi.exec();

      const complete = CollatorService.isJobComplete(this.context.metadata.js);
      this.transition(complete);
      return this.context.metadata.jid;
    } catch (error) {
      if (error instanceof DuplicateJobError) {
        this.logger.error('duplicate-job-error', error);
      } else {
        this.logger.error('trigger-process-error', error);
      }
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      throw error;
    } finally {
      this.endSpan(jobSpan);
      this.endSpan(span);
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
    //triggers persist 2 spans (`l1s` is the JOB span, `l2s` is the trigger/activity span)
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
      throw new DuplicateJobError(jobId);
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
