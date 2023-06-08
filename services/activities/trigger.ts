// import {
//   RestoreJobContextError, 
//   MapInputDataError, 
//   SubscribeToResponseError, 
//   RegisterTimeoutError, 
//   ExecActivityError, 
//   DuplicateActivityError} from '../../../modules/errors';
import { KeyType } from '../../modules/key';
import { getGuid, getTimeSeriesStamp } from '../../modules/utils';
import { Activity } from "./activity";
import { CollatorService } from '../collator';
import { EngineService } from '../engine';
import { Pipe } from "../pipe";
import { ReporterService } from '../reporter';
import { SerializerService } from '../store/serializer';
import {
  ActivityData,
  ActivityMetadata,
  ActivityType,
  TriggerActivity,
  FlattenedDataObject, 
  HookData} from "../../typedefs/activity";
import { JobActivityContext, JobMetadata } from '../../typedefs/job';
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
      await this.createContext();
      this.mapJobData();
      this.mapOutputData();
      //todo: should target job id instead (not job+activity!)
      await this.saveActivityNX();

      /////// MULTI:START ///////
      const multi = this.store.getMulti();
      await this.saveActivity(multi);
      await this.saveJob(multi);
      await this.saveJobStats(multi);
      await multi.exec();
      /////// MULTI:END ///////

      const activityStatus = this.context.metadata.js;
      const isComplete = CollatorService.isJobComplete(activityStatus);
      this.transition(isComplete);
      return this.context.metadata.jid;
    } catch (error) {
      this.logger.error('trigger.process:error', error);
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
        jid: jobId,
        key: jobKey,
        jc: utc,
        ju: utc,
        ts: getTimeSeriesStamp(this.resolveGranularity()),
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
    const stats = this.config.stats;
    const jobId = stats?.id;
    if (jobId) {
      return Pipe.resolve(jobId, context);
    } else {
      return getGuid();
    }
  }

  resolveJobKey(context: Partial<JobActivityContext>): string {
    const stats = this.config.stats;
    const jobKey = stats?.measures?.length && stats?.key;
    if (jobKey) {
      return Pipe.resolve(jobKey, context);
    } else {
      return ''; //no key means no stats are saved
    }
  }

  mapOutputData(): void {
    //this.config.dependents = [ "d/operation", "d/values" ];
    //this.config.depends = { "calculate": ["d/operation", "d/values"], "operate": ["d/result"]}
    const aid = this.metadata.aid;
    const filteredData: FlattenedDataObject = {};
    const toFlatten = { [aid]: { output: { data: this.data } } };
    const rulesSet = new Set(this.config.dependents.map(rule => rule.slice(1, -1).replace(/\./g, '/')));
    const flattenedData = SerializerService.flattenHierarchy(toFlatten);
    for (const [key, value] of Object.entries(flattenedData)) {
      if (rulesSet.has(key)) {
        filteredData[key as string] = value as string;
      }
    }
    const restoredData = SerializerService.restoreHierarchy(filteredData);
    if (restoredData[aid]) {
      this.context[aid].output.data = restoredData[aid].output.data;
    }
  }

  toSaveJobMetadata(): Partial<JobMetadata> {
    return this.context.metadata;
  }

  async saveActivityNX(): Promise<void> {
    //TODO: target the bare job id (not + activity)...can produce a collision still and subordinate to the wrong job
    //NX ensures no job id dupes
    const jobId = this.context.metadata.jid;
    const activityId = this.metadata.aid;
    const response = await this.store.setActivityNX(
      jobId,
      activityId,
      await this.engine.getVID()
    );
    if (response !== 1) {
      const key = this.store.mintKey(
        KeyType.JOB_ACTIVITY_DATA, 
        { appId: (await this.engine.getVID()).id, jobId, activityId }
      );
      throw new Error(`Duplicate. Job ${jobId} already exists`);
    }
  }

  async saveJobStats(multi?: RedisMulti): Promise<void> {
    const md = this.context.metadata;
    if (md.key) {
      const config = await this.engine.getVID();
      const reporter = new ReporterService(config, this.store, this.logger);
      await this.store.setJobStats(
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
