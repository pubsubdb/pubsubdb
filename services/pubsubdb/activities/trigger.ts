import { PubSubDBService } from '..';
import { Pipe } from "../../pipe";
import { KeyType } from '../../store/key';
import { SerializerService } from '../../store/serializer';
import { Activity } from "./activity";
// import {
//   RestoreJobContextError, 
//   MapInputDataError, 
//   SubscribeToResponseError, 
//   RegisterTimeoutError, 
//   ExecActivityError, 
//   DuplicateActivityError} from '../../../modules/errors';
import {
  ActivityData,
  ActivityMetadata,
  ActivityType,
  TriggerActivity,
  FlattenedDataObject, 
  HookData} from "../../../typedefs/activity";
import { JobContext } from '../../../typedefs/job';
import { StatsType, Stat } from '../../../typedefs/stats';

class Trigger extends Activity {
  config: TriggerActivity;

  constructor(
    config: ActivityType,
    data: ActivityData,
    metadata: ActivityMetadata,
    hook: HookData | null,
    pubsubdb: PubSubDBService,
    context?: JobContext) {
      super(config, data, metadata, hook, pubsubdb, context);
  }

  async process(): Promise<string> {
    try {
      await this.createContext();
      await this.mapJobData();
      await this.mapOutputData();
      await this.saveActivityNX();
      
      /////// MULTI ///////
      const multi = this.pubsubdb.store.getMulti();
      await this.saveActivity(multi);
      await this.saveJob(multi);
      await this.saveStats(multi);
      await multi.exec();
      /////// MULTI ///////

      this.pub();
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

  createInputContext(): Partial<JobContext> {
    return { 
      [this.metadata.aid]: { input: { data: this.data } }
    } as Partial<JobContext>;
  }

  async createContext(): Promise<void> {
    const inputContext = this.createInputContext();
    const jobId = this.resolveJobId(inputContext);
    const jobKey = this.resolveJobKey(inputContext);

    //create job context
    const utc = new Date().toISOString();
    const { id, version } = await this.pubsubdb.getAppConfig();
    const activityMetadata = { ...this.metadata, jid: jobId, key: jobKey };
    this.context = {
      metadata: {
        ...this.metadata,
        app: id,
        vrs: version,
        jid: jobId,
        key: jobKey,
        jc: utc,
        ju: utc,
        ts: this.getTimeSeriesStamp(),
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

  getJobStatus(): number {
    return this.config.collationKey - this.config.collationInt * 3;
  }

  resolveJobId(context: Partial<JobContext>): string {
    const stats = this.config.stats;
    const jobId = stats?.id;
    if (jobId) {
      const pipe = new Pipe([[jobId]], context);
      return pipe.process();
    } else {
      return `${Date.now().toString()}.${parseInt((Math.random() * 1000).toString(), 10)}`;
    }
  }

  resolveJobKey(context: Partial<JobContext>): string {
    const stats = this.config.stats;
    const jobKey = stats?.key;
    if (jobKey) {
      let pipe: Pipe;
      if (Pipe.isPipeObject(jobKey)) {
        pipe = new Pipe(jobKey['@pipe'], context);
      } else {
        pipe = new Pipe([[jobKey]], context);
      }
      return pipe.process();
    } else {
      return '';
    }
  }

  async mapOutputData(): Promise<void> {
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

  saveJobMetadata(): boolean {
    return true;
  }

  async saveActivityNX(multi?: any): Promise<void> {
    //NX ensures no job id dupes
    const jobId = this.context.metadata.jid;
    const activityId = this.metadata.aid;
    const response = await this.pubsubdb.store.setActivityNX(
      jobId,
      activityId,
      await this.pubsubdb.getAppConfig()
    );
    if (response !== 1) {
      const key = this.pubsubdb.store.mintKey(
        KeyType.JOB_ACTIVITY_DATA, 
        { appId: (await this.pubsubdb.getAppConfig()).id, jobId, activityId }
      );
      throw new Error(`Duplicate. Job ${jobId} already exists`);
    }
  }

  resolveStats(): StatsType {
    const s = this.config.stats;
    const stats: StatsType = {
      general: [],
      index: [],
      median: []
    }
    stats.general.push({ metric: 'count', target: 'count', value: 1 });
    for (const measure of s.measures) {
      const metric = this.resolveMetric({ metric: measure.measure, target: measure.target });
      if (this.isGeneralMetric(measure.measure)) {
        stats.general.push(metric);
      } else if (this.isMedianMetric(measure.measure)) {
        stats.median.push(metric);
      } else if (this.isIndexMetric(measure.measure)) {
        stats.index.push(metric);
      }
    }
    return stats;
  }

  isGeneralMetric(metric: string): boolean {
    return metric === 'sum' || metric === 'avg' || metric === 'count';
  }

  isMedianMetric(metric: string): boolean {
    return metric === 'mdn';
  }

  isIndexMetric(metric: string): boolean {
    return metric === 'index';
  }

  resolveMetric({metric, target}): Stat {
    const pipe = new Pipe([[target]], this.context);
    const resolvedValue = pipe.process().toString();
    const resolvedTarget = this.resolveTarget(metric, target, resolvedValue);
    if (metric === 'index') {
      return { metric, target: resolvedTarget, value: this.context.metadata.jid };
    } else if (metric === 'count') {
      return { metric, target: resolvedTarget, value: 1 };
    }
    return { metric, target: resolvedTarget, value: resolvedValue } as Stat;
  }

  isCardinalMetric(metric: string): boolean {
    return metric === 'index' || metric === 'count';
  }

  resolveTarget(metric: string, target: string, resolvedValue: string): string {
    const trimmed = target.substring(1, target.length - 1);
    const trimmedTarget = trimmed.split('.').slice(3).join('/');
    let resolvedTarget: string;
    if (this.isCardinalMetric(metric)) {
      resolvedTarget = `${metric}:${trimmedTarget}:${resolvedValue}`;
    } else {
      resolvedTarget = `${metric}:${trimmedTarget}`;
    }
    return resolvedTarget;
  }

  /**
   * returns the time series stamp to use (12-digit derivation of ISOString)
   */
  getTimeSeriesStamp(): string {
    const now = new Date();
    const granularity = this.resolveGranularity();
    const granularityUnit = granularity.slice(-1);
    const granularityValue = parseInt(granularity.slice(0, -1), 10);
    if (granularityUnit === 'm') {
      const minute = Math.floor(now.getMinutes() / granularityValue) * granularityValue;
      now.setUTCMinutes(minute, 0, 0);
    } else if (granularityUnit === 'h') {
      now.setUTCMinutes(0, 0, 0);
    }
    return now.toISOString().replace(/:\d\d\..+|-|T/g, '').replace(':','');
  }

  resolveGranularity(): string {
    return this.config.stats?.granularity || '1h';
  }

  async saveStats(multi?: any): Promise<void> {
    if (this.context.metadata.key) {
      await this.pubsubdb.store.setJobStats(
        this.context.metadata.key,
        this.context.metadata.jid,
        this.context.metadata.ts,
        this.resolveStats(),
        await this.pubsubdb.getAppConfig(),
        multi
      );
    }
  }
}

export { Trigger };
