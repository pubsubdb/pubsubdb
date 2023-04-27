import { PubSubDBService } from '..';
import {
  RestoreJobContextError, 
  MapInputDataError, 
  SubscribeToResponseError, 
  RegisterTimeoutError, 
  ExecActivityError, 
  DuplicateActivityError} from '../../../modules/errors';
import {
  ActivityData,
  ActivityMetadata,
  ActivityType,
  TriggerActivity } from "../../../typedefs/activity";
import { JobContext } from '../../../typedefs/job';
import { StatsType, Stat } from '../../../typedefs/stats';
import { MapperService } from '../../mapper';
import { Pipe } from "../../pipe";
import { KeyType } from '../../store/key';
import { SerializerService } from '../../store/serializer';
import { Activity } from "./activity";

type FlattenedDataObject = { [key: string]: string };

class Trigger extends Activity {
  config: TriggerActivity;

  constructor(
    config: ActivityType,
    data: ActivityData,
    metadata: ActivityMetadata,
    pubsubdb: PubSubDBService,
    context?: JobContext) {
      super(config, data, metadata, pubsubdb, context);
  }

  /**
   * trigger-specific processing of the activity
   * @returns {Promise<string>} A promise that resolves with the job id.
   */
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
      if (error instanceof DuplicateActivityError) {
      } else if (error instanceof RestoreJobContextError) {
      } else if (error instanceof MapInputDataError) {
      } else if (error instanceof SubscribeToResponseError) {
      } else if (error instanceof RegisterTimeoutError) {
      } else if (error instanceof ExecActivityError) {
      } else {
      }
      throw error;
    }
  }

  /**
   * Initialize the job context for the flow.
   * @returns {Promise<void>} A promise that resolves when the job is created.
   */
  async createContext(): Promise<void> {
    const utc = new Date().toISOString();
    const { id, version } = await this.pubsubdb.getAppConfig();
    this.context = {
      metadata: {
        ...this.metadata,
        app: id,
        vrs: version,
        jid: null,
        key: null,
        jc: utc,
        ju: utc,
        ts: this.getTimeSeriesStamp(),
        js: this.getJobStatus(),
      },
      data: {},
      [this.metadata.aid]: { 
        input: { data: this.data },
        output: { data: {} },
        settings: { data: {} },
        errors: { data: {} },
       },
    };

    this.context.metadata.jid = this.resolveJobId();
    this.context.metadata.key = this.resolveJobKey();
  }

  /**
   * every job starts out with the trigger in a completed state (6) which
   * is why this method multiplies the collation int by `3` (9 - 3 = 6).
   * 
   * @see CollationService
   * @returns {number} 1 - 15 digit integer multiplied by 3 (3, 30, 300, ...)
   */
  getJobStatus(): number {
    return this.config.collationKey - (this.config.collationInt * 3);
  }

  resolveJobId(): string {
    const stats = this.config.stats;
    const jobId = stats?.id;
    if (jobId) {
      const pipe = new Pipe([[jobId]], this.context);
      return pipe.process();
    } else {
      return `${Date.now().toString()}.${parseInt((Math.random() * 1000).toString(), 10)}`;
    }
  }

  resolveJobKey(): string {
    const stats = this.config.stats;
    const jobKey = stats?.key;
    if (jobKey) {
      let pipe: Pipe;
      if (Pipe.isPipeObject(jobKey)) {
        //pipe syntax
        pipe = new Pipe(jobKey['@pipe'], this.context);
      } else {
        //concise syntax
        pipe = new Pipe([[jobKey]], this.context);
      }
      return pipe.process();
    } else {
      //no job key means no data isolation (which is fine)
      return '';
    }
  }

  /**
   * If the job returns data, and the trigger includes a map ruleset to seed it with the
   * incoming event payload, then map the data per the ruleset
   */
  async mapJobData(): Promise<void> {
    if(this.config.job?.maps) {
      const mapper = new MapperService(this.config.job.maps, this.context);
      this.context.data = await mapper.mapRules();
    }
  }

  /**
   * only map those fields of data in the payload that are specified in the
   * downstream mapping rules for other activities
   */
  async mapOutputData(): Promise<void> {
    const aid = this.metadata.aid;
    const filteredData: FlattenedDataObject = {};
    //flattening the payload simplifies filtering
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

  /**
   * saves job data (if any) and metadata
   */
  async saveJob(multi?: any): Promise<void> {
    const jobId = this.context.metadata.jid;
    await this.pubsubdb.store.setJob(
      jobId,
      this.context.data,
      this.context.metadata,
      await this.pubsubdb.getAppConfig(),
      multi
    );
  }

  /**
   * saves just the activity id to ensure no dupes before proceeding with the multi insert
   */
  async saveActivityNX(multi?: any): Promise<void> {
    const jobId = this.context.metadata.jid;
    const activityId = this.metadata.aid;
    const response = await this.pubsubdb.store.setActivityNX(
      jobId,
      activityId,
      await this.pubsubdb.getAppConfig()
    );
    if (response !== 1) {
      const key = this.pubsubdb.store.mintKey(KeyType.JOB_ACTIVITY_DATA, { appId: (await this.pubsubdb.getAppConfig()).id, jobId, activityId });
      throw new Error(`Duplicate Activity. Job/Activity ${key} already exists`);
    }
  }

  /**
   * saves activity meta/data; only data relevant to downstream activities
   * will be persisted.
   */
  async saveActivity(multi?: any): Promise<void> {
    const jobId = this.context.metadata.jid;
    const activityId = this.metadata.aid;
    await this.pubsubdb.store.setActivity(
      jobId,
      activityId,
      this.context[activityId].output.data,
      { ...this.metadata, jid: jobId, key: this.context.metadata.key },
      await this.pubsubdb.getAppConfig(),
      multi
    );
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
   * returns the time series stamp for the current time based on the granularity setting
   * @returns {string} e.g. 202302280000
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
    
  /**
   * aggregation stats are only persisted if the trigger has a `stats` field with a valid job_key
   * Stats are persisted to a hash, list, or zset depending on the type of aggregation.
   */
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

  /**
   * publish the output data and job context to the subscribed activities in the
   * subscription patterns hash.
   * @returns {Promise<void>}
   */
  async pub(): Promise<void> {
    const transitions = await this.pubsubdb.store.getTransitions(await this.pubsubdb.getAppConfig());
    const transition = transitions[`.${this.metadata.aid}`];
    if (transition) {
      for (let p in transition) {
        await this.pubsubdb.pub(`.${p}`, this.context[this.metadata.aid].output.data, this.context);
      }
    }
  }
}

export { Trigger };
