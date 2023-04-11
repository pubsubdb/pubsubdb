import { PubSubDBService } from '..';
import {
  RestoreJobContextError, 
  MapInputDataError, 
  SubscribeToResponseError, 
  RegisterTimeoutError, 
  ExecActivityError } from '../../../modules/errors';
import {
  ActivityData,
  ActivityMetadata,
  ActivityType,
  TriggerActivity } from "../../../typedefs/activity";
import { StatsType, Stat } from '../../../typedefs/stats';
import { Pipe } from "../../pipe";
import { Activity } from "./activity";

class Trigger extends Activity {
  config: TriggerActivity;

  constructor(config: ActivityType, data: ActivityData, metadata: ActivityMetadata, pubsubdb: PubSubDBService) {
    super(config, data, metadata, pubsubdb);
  }

  /**
   * trigger-specific processing of the activity
   */
  async process() {
    try {
      await this.createContext();
      await this.mapJobData();
      await this.mapOutputData();
      await this.saveContext();
      await this.saveStats();
      await this.pub();
    } catch (error) {
      if (error instanceof RestoreJobContextError) {
        // Handle restoreJobContext error
      } else if (error instanceof MapInputDataError) {
        // Handle mapInputData error
      } else if (error instanceof SubscribeToResponseError) {
        // Handle subscribeToResponse error
      } else if (error instanceof RegisterTimeoutError) {
        // Handle registerTimeout error
      } else if (error instanceof ExecActivityError) {
        // Handle execActivity error
      } else {
        // Handle generic error
      }
    }
  }

  /**
   * Initialize the job context for the flow.
   * @returns {Promise<void>} A promise that resolves when the job is created.
   */
  async createContext(): Promise<void> {
    //create the initial job context
    const utc = new Date().toUTCString();
    const appConfig = this.pubsubdb.getAppConfig();
    this.context = {
      metadata: {
        ...this.metadata,
        app_id: appConfig.id,
        app_version: appConfig.version,
        job_id: null,  //job id
        job_key: null, //job key
        job_created: utc,
        job_updated: utc,
        job_status: this.createCollationKey(),
      },
      data: { }, //job data (would get created if any map statements were present)
      input: { data: this.data },
      output: { data: {} },
      settings: { data: {} },
      errors: { data: {} },
    };
    //add job id and key to the job context (they are generated using the context and then added to it)
    this.context.metadata.job_id = await this.getJobId();
    this.context.metadata.job_key = await this.getJobKey();
    //resolve the job stats (if any)
  }

  /**
   * Because this is a graph, we
   * cannot rely on the order of the activities in the manifest file and instead just
   * alphabetically sort the activities by their ID (ascending) ["a1", "a2", "a3", ...]
   * and then bind the sorted array to the trigger activity. This is used by the trigger
   * at runtime to create 15-digit collation integer (99999999999) that can be used to track
   * the status of the job at the level of the individual activity. A collation value of
   * 899000000000000 means that the first activity (assume 'a1') is running and the others
   * are still pending. Remember that this is alphabetical, so it is merely coincidence that
   * the value was `899*` and not `989*` or `998*`.
   * @returns {number} A number that represents the collation key for the job.
   */
  createCollationKey(): number {
    const length = this.config.sortedActivityIds.length;
    const val = Math.pow(10, length) - 1; //e.g, 999, 99999, 9999999, etc
    const numberAsString = val.toString();
    const targetLength = 15;
    const paddedNumber = numberAsString + "0".repeat(targetLength - length);
    return parseInt(paddedNumber, 10);
  }

  /**
   * use stats field for trigger to get job id and key
   * @returns 
   */
  async getJobId(): Promise<string> {
    const stats = this.config.stats;
    const jobId = stats?.id;
    if (jobId) {
      console.log(`job id dynprop for trigger ${this.metadata.activity_id}: ${jobId}`);
      const pipe = new Pipe([jobId], this.data);
      return await pipe.process();
    } else {
      console.log(`no job id dynprop for trigger ${this.metadata.activity_id}`);
      //todo: create synchronizer service to coordinate cache invalidation, new app deployments, etc
      return `${Date.now().toString()}.${parseInt((Math.random() * 1000).toString(), 10)}`;
    }
  }

  async getJobKey(): Promise<string> {
    const stats = this.config.stats;
    const jobKey = stats?.key;
    if (jobKey) {
      console.log(`trigger job key found: ${this.metadata.activity_id}: ${jobKey}`);
      const pipe = new Pipe([jobKey], this.data);
      return await pipe.process();
    } else {
      console.log(`trigger job key NOT found: ${this.metadata.activity_id}`);
      //todo: use server-assigned instance id to assign the random number slot at startup (001-999)
      return `${Date.now().toString()}.${parseInt((Math.random() * 1000).toString(), 10)}`;
    }
  }

  /**
   * Triggers produce two types of data: `job meta/data` and `trigger output data`. 
   * Job meta/data is defined by the trigger and represents the job context for the flow.
   * A flow does not need to have job data. If there is no input provided to the flow
   * when invoked, then no data will be proviided to downstream activities. And
   * if the schema def for the trigger does not specify a `job` field that defines job data
   * for the completed job, then the flow will not have any job data either.
   * @returns {Promise<void>} A promise that resolves when the input data mapping is done.
   */
  async mapJobData(): Promise<void> {
    return;
  }

  /**
   * If a trigger schema def includes a 'job' field with a `schema` and a `map`, it means the fields
   * listed should be mapped from the incoming event payload to the job data. 
   * @returns {Promise<void>} A promise that resolves when the input data mapping is done.
   */
  async mapOutputData(): Promise<void> {
    return;
  }

  async saveContext(): Promise<void> {
    const jobId = this.context.metadata.job_id;
    await this.pubsubdb.store.setJob(jobId, this.context.data, this.metadata, { id: 'test-app', version: '1' });
  }

  resolveStats(): StatsType {
    const s = this.config.stats;
    const stats: StatsType = {
      general: [],
      index: [],
      median: []
    }
    for (const measure of s.measures) {
      switch (measure.measure) {
        case 'sum':
          stats.general.push({ metric: 'sum', target: measure.target, value: 0 });
          break;
        case 'avg':
          stats.general.push({ metric: 'avg', target: measure.target, value: 0 });
          break;
        case 'count':
          stats.general.push({ metric: 'count', target: measure.target, value: 0 });
          break;
        case 'mdn':
          stats.median.push({ metric: 'mdn', target: measure.target, value: 0 });
          break;
        case 'index':
          stats.index.push({ metric: 'index', target: measure.target, value: 0 });
          break;
      }
    }
    return stats;
  }

  resolveMetric({metric, target, value}): Stat {
    const pipe = new Pipe([target], this.context.data);
    const resolvedValue = pipe.process().toString(); //values are used for redis keys, so they must be strings
    const resolvedTarget = this.resolveTarget(metric, target, resolvedValue);
    if (metric === 'index') {
      return { metric, target: resolvedTarget, value: this.context.metadata.job_id };
    } else if (metric === 'count') {
      return { metric, target: resolvedTarget, value: 1 };
    }
    return { metric, target: resolvedTarget, value: resolvedValue };
  }

  resolveTarget(metric: string, target: string, resolvedValue: string): string {
    //trim the curly braces from target, replace periods with forward slashes.
    const trimmedTarget = target.substring(1, target.length - 1).replace(/\./g, '/');
    const resolvedTarget = `${metric}/${trimmedTarget}/${resolvedValue}`;
    return resolvedTarget;
  }
    
  /**
   * aggregation stats are only persisted if the trigger has a `stats` field with a valid job_key
   * Stats are persisted to a hash, list, or zset depending on the type of aggregation.
   */
  async saveStats(): Promise<void> {
    const m = this.context.metadata;
    if (m.job_key) {
      await this.pubsubdb.store.setJobStats(
        m.job_key,
        m.job_id,
        this.resolveStats(),
        this.pubsubdb.getAppConfig()
      );
    }
  }

  /**
   * publish the output data and job context to the subscribed activities in the
   * subscription patterns hash.
   * @returns {Promise<void>} A promise that resolves when the activity execution is done.
   */
  async pub(): Promise<void> {
    const subscriptionPatterns = this.pubsubdb.store.getSubscriptionPatterns(this.pubsubdb.getAppConfig());
  }
}

export { Trigger };
