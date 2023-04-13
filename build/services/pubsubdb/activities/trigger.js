"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Trigger = void 0;
const errors_1 = require("../../../modules/errors");
const mapper_1 = require("../../mapper");
const pipe_1 = require("../../pipe");
const serializer_1 = require("../../store/serializer");
const activity_1 = require("./activity");
class Trigger extends activity_1.Activity {
    constructor(config, data, metadata, pubsubdb, context) {
        super(config, data, metadata, pubsubdb, context);
    }
    /**
     * trigger-specific processing of the activity
     */
    async process() {
        try {
            await this.createContext();
            await this.mapJobData();
            await this.mapOutputData();
            await this.saveActivity();
            await this.saveContext();
            await this.saveStats();
            await this.pub();
        }
        catch (error) {
            console.log('trigger process() error', error);
            if (error instanceof errors_1.RestoreJobContextError) {
                // Handle restoreJobContext error
            }
            else if (error instanceof errors_1.MapInputDataError) {
                // Handle mapInputData error
            }
            else if (error instanceof errors_1.SubscribeToResponseError) {
                // Handle subscribeToResponse error
            }
            else if (error instanceof errors_1.RegisterTimeoutError) {
                // Handle registerTimeout error
            }
            else if (error instanceof errors_1.ExecActivityError) {
                // Handle execActivity error
            }
            else {
                // Handle generic error
            }
        }
    }
    /**
     * Initialize the job context for the flow.
     * @returns {Promise<void>} A promise that resolves when the job is created.
     */
    async createContext() {
        const utc = new Date().toISOString();
        const appConfig = this.pubsubdb.getAppConfig();
        this.context = {
            metadata: {
                ...this.metadata,
                app: appConfig.id,
                vrs: appConfig.version,
                jid: null,
                key: null,
                jc: utc,
                ju: utc,
                ts: this.getTimeSeriesStamp(),
                js: this.createCollationKey(),
            },
            data: {},
            [this.metadata.aid]: {
                input: { data: this.data },
                output: { data: {} },
                settings: { data: {} },
                errors: { data: {} },
            },
        };
        //must first initialize the job context before we can get the job id and key
        this.context.metadata.jid = await this.getJobId();
        this.context.metadata.key = await this.getJobKey();
    }
    /**
     * alphabetically sort the activities by their ID (ascending) ["a1", "a2", "a3", ...]
     * and then bind the sorted array to the trigger activity. This is used by the trigger
     * at runtime to create 15-digit collation integer (99999999999) that can be used to track
     * the status of the job at the level of the individual activity. A collation value of
     * 899000000000000 means that the first activity (assume 'a1') is running and the others
     * are still pending. Remember that this is alphabetical, so it is merely coincidence that
     * the value was `899*` and not `989*` or `998*`.
     * @returns {number} A number that represents the collation key for the job.
     */
    createCollationKey() {
        const length = this.config.sortedActivityIds.length;
        const val = Math.pow(10, length) - 1; //e.g, 999, 99999, 9999999, etc
        const numberAsString = val.toString();
        const targetLength = 15;
        const paddedNumber = numberAsString + '0'.repeat(targetLength - length);
        return parseInt(paddedNumber, 10);
    }
    /**
     * use stats field for trigger to get job id and key
     * @returns
     */
    async getJobId() {
        const stats = this.config.stats;
        const jobId = stats?.id;
        if (jobId) {
            const pipe = new pipe_1.Pipe([[jobId]], this.context);
            return await pipe.process();
        }
        else {
            //todo: create synchronizer service to coordinate cache invalidation, new app deployments, etc
            return `${Date.now().toString()}.${parseInt((Math.random() * 1000).toString(), 10)}`;
        }
    }
    async getJobKey() {
        const stats = this.config.stats;
        const jobKey = stats?.key;
        if (jobKey) {
            let pipe;
            if (pipe_1.Pipe.isPipeObject(jobKey)) {
                //this is the more complex pipe syntax (an array of arrays)
                pipe = new pipe_1.Pipe(jobKey['@pipe'], this.context);
            }
            else {
                //this is the simple inline syntax (wrap in two arrays to adhere to the pipe syntax)
                pipe = new pipe_1.Pipe([[jobKey]], this.context);
            }
            return await pipe.process();
        }
        else {
            //todo: use server-assigned instance id to assign the random number slot at startup (001-999)
            return `${Date.now().toString()}.${parseInt((Math.random() * 1000).toString(), 10)}`;
        }
    }
    /**
     * If the job returns data, and the trigger includes a map ruleset to seed it with the
     * incoming event payload, then map the data per the ruleset..
     * @returns {Promise<void>}
     */
    async mapJobData() {
        if (this.config.job?.maps) {
            const mapper = new mapper_1.MapperService(this.config.job.maps, this.context);
            this.context.data = await mapper.mapRules();
        }
    }
    /**
     * only map those fields of data in the payload that are specified in the downstream mapping rules for other activities
     * @returns {Promise<void>}
     */
    async mapOutputData() {
        const aid = this.metadata.aid;
        const filteredData = {};
        //flatten the payload to make comparison easier
        const toFlatten = { [aid]: { output: { data: this.data } } };
        const rulesSet = new Set(this.config.dependents.map(rule => rule.slice(1, -1).replace(/\./g, '/')));
        const flattenedData = serializer_1.SerializerService.flattenHierarchy(toFlatten);
        for (const [key, value] of Object.entries(flattenedData)) {
            if (rulesSet.has(key)) {
                filteredData[key] = value;
            }
        }
        //expand the payload now that we've removed those fields not specified by downstream mapping rules
        const restoredData = serializer_1.SerializerService.restoreHierarchy(filteredData);
        if (restoredData[aid]) {
            this.context[aid].output.data = restoredData[aid].output.data;
        }
    }
    async saveContext() {
        const jobId = this.context.metadata.jid;
        await this.pubsubdb.store.setJob(jobId, this.context.data, this.context.metadata, this.pubsubdb.getAppConfig());
    }
    /**
     * saves activity data; (NOTE: This data represents a subset of the incoming event payload.
     * those fields that are not specified in the mapping rules for other activities will not be saved.)
     */
    async saveActivity() {
        const jobId = this.context.metadata.jid;
        const activityId = this.metadata.aid;
        await this.pubsubdb.store.setActivity(jobId, activityId, this.context[activityId].output.data, { ...this.metadata, jid: jobId, key: this.context.metadata.key }, this.pubsubdb.getAppConfig());
    }
    resolveStats() {
        const s = this.config.stats;
        const stats = {
            general: [],
            index: [],
            median: []
        };
        stats.general.push({ metric: 'count', target: 'count', value: 1 });
        for (const measure of s.measures) {
            const metric = this.resolveMetric({ metric: measure.measure, target: measure.target });
            if (this.isGeneralMetric(measure.measure)) {
                stats.general.push(metric);
            }
            else if (this.isMedianMetric(measure.measure)) {
                stats.median.push(metric);
            }
            else if (this.isIndexMetric(measure.measure)) {
                stats.index.push(metric);
            }
        }
        return stats;
    }
    isGeneralMetric(metric) {
        return metric === 'sum' || metric === 'avg' || metric === 'count';
    }
    isMedianMetric(metric) {
        return metric === 'mdn';
    }
    isIndexMetric(metric) {
        return metric === 'index';
    }
    resolveMetric({ metric, target }) {
        const pipe = new pipe_1.Pipe([[target]], this.context);
        const resolvedValue = pipe.process().toString();
        const resolvedTarget = this.resolveTarget(metric, target, resolvedValue);
        if (metric === 'index') {
            return { metric, target: resolvedTarget, value: this.context.metadata.jid };
        }
        else if (metric === 'count') {
            return { metric, target: resolvedTarget, value: 1 };
        }
        return { metric, target: resolvedTarget, value: resolvedValue };
    }
    isCardinalMetric(metric) {
        //these metrics isolate the metric based on value cardinality
        return metric === 'index' || metric === 'count';
    }
    resolveTarget(metric, target, resolvedValue) {
        const trimmed = target.substring(1, target.length - 1);
        const trimmedTarget = trimmed.split('.').slice(3).join('/');
        let resolvedTarget;
        if (this.isCardinalMetric(metric)) {
            resolvedTarget = `${metric}:${trimmedTarget}:${resolvedValue}`;
        }
        else {
            resolvedTarget = `${metric}:${trimmedTarget}`;
        }
        return resolvedTarget;
    }
    /**
     * returns the time series stamp for the current time based on the granularity setting
     * @returns {string} e.g. 202302280000
     */
    getTimeSeriesStamp() {
        const now = new Date();
        const granularity = this.config.stats.granularity || '1h';
        const granularityUnit = granularity.slice(-1);
        const granularityValue = parseInt(granularity.slice(0, -1), 10);
        if (granularityUnit === 'm') {
            const minute = Math.floor(now.getMinutes() / granularityValue) * granularityValue;
            now.setUTCMinutes(minute, 0, 0);
        }
        else if (granularityUnit === 'h') {
            now.setUTCMinutes(0, 0, 0);
        }
        return now.toISOString().replace(/:\d\d\..+|-|T/g, '').replace(':', '');
    }
    /**
     * aggregation stats are only persisted if the trigger has a `stats` field with a valid job_key
     * Stats are persisted to a hash, list, or zset depending on the type of aggregation.
     */
    async saveStats() {
        if (this.context.metadata.key) {
            await this.pubsubdb.store.setJobStats(this.context.metadata.key, this.context.metadata.jid, this.context.metadata.ts, this.resolveStats(), this.pubsubdb.getAppConfig());
        }
    }
    /**
     * publish the output data and job context to the subscribed activities in the
     * subscription patterns hash.
     * @returns {Promise<void>}
     */
    async pub() {
        const transitions = await this.pubsubdb.store.getTransitions(this.pubsubdb.getAppConfig());
        const transition = transitions[`.${this.metadata.aid}`];
        if (transition) {
            for (let p in transition) {
                await this.pubsubdb.pub(`.${p}`, this.context[this.metadata.aid].output.data, this.context);
            }
        }
    }
}
exports.Trigger = Trigger;
