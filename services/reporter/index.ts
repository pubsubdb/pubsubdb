import {
  GetStatsOptions,
  StatsResponse,
  AggregatedData,
  Measure,
  Segment,
  JobStatsRange,
  IdsData,
  IdsResponse,
  MeasureIds, 
  TimeSegment,
  CountByFacet} from '../../typedefs/stats';
import {AppVersion} from '../../typedefs/app';
import { ILogger } from '../logger';
import { StoreService as Store } from '../store';

class ReporterService {
  private appConfig: AppVersion;
  private logger: ILogger;
  private store: Store;

  constructor(appConfig: AppVersion, store: Store, logger: ILogger) {
    this.appConfig = appConfig;
    this.logger = logger;
    this.store = store;
  }

  getAppConfig() {
    return this.appConfig;
  }

  async getStats(options: GetStatsOptions): Promise<StatsResponse> {
    this.logger.debug('get_stats', options);
    const { key, granularity, range, end, start } = options;
    this.validateOptions(options);
    const dateTimeSets = this.generateDateTimeSets(granularity, range, end, start);
    const redisKeys = dateTimeSets.map((dateTime) => this.buildRedisKey(key, dateTime));
    const rawData = await this.store.getJobStats(redisKeys, this.getAppConfig());
    const [count, aggregatedData] = this.aggregateData(rawData);
    const statsResponse = this.buildStatsResponse(rawData, redisKeys, aggregatedData, count, options);
    return statsResponse;
  }

  private validateOptions(options: GetStatsOptions): void {
    const { start, end, range } = options;
    if (start && end && range || !start && !end && !range) {
      throw new Error('Invalid combination of start, end, and range values. Provide either start+end, end+range, or start+range.');
    }
  }
  private generateDateTimeSets(granularity: string, range: string|undefined, end: string, start?: string): string[] {
    if (!range) {
      //pluck just a single value when no range provided
      range = '0m';
    }
    const granularitiesInMinutes = {
      '5m': 5,
      '10m': 10,
      '15m': 15,
      '30m': 30,
      '1h': 60,
    };
    const granularityMinutes = granularitiesInMinutes[granularity];
    if (!granularityMinutes) {
      throw new Error('Invalid granularity value.');
    }
    const rangeMinutes = this.convertRangeToMinutes(range);
    if (rangeMinutes === null) {
      throw new Error('Invalid range value.');
    }
    // If start is provided, use it. Otherwise, calculate it from the end time and range.
    let startTime;
    let endTime;
    if (start) {
      startTime = new Date(start);
      endTime = new Date(startTime.getTime() + rangeMinutes * 60 * 1000);
    } else {
      endTime = end === 'NOW' ? new Date() : new Date(end);
      startTime = new Date(endTime.getTime() - rangeMinutes * 60 * 1000);
    }
    // Round the start time to the nearest granularity unit
    startTime.setUTCMinutes(
      Math.floor(startTime.getUTCMinutes() / granularityMinutes) * granularityMinutes
    );
    const dateTimeSets: string[] = [];
    for (
      let time = startTime;
      time <= endTime;
      time.setUTCMinutes(time.getUTCMinutes() + granularityMinutes)
    ) {
      const formattedTime = [
        time.getUTCFullYear(),
        String(time.getUTCMonth() + 1).padStart(2, '0'),
        String(time.getUTCDate()).padStart(2, '0'),
        String(time.getUTCHours()).padStart(2, '0'),
        String(time.getUTCMinutes()).padStart(2, '0'),
      ].join('');
      dateTimeSets.push(formattedTime);
    }
    return dateTimeSets;
  }
  
  private convertRangeToMinutes(range: string): number | null {
    const timeUnit = range.slice(-1);
    const value = parseInt(range.slice(0, -1), 10);
    if (isNaN(value)) {
      return null;
    }
    switch (timeUnit) {
      case 'm':
        return value;
      case 'h':
        return value * 60;
      case 'd':
        return value * 60 * 24;
      default:
        return null;
    }
  }  

  private buildRedisKey(key: string, dateTime: string, subTarget = ''): string {
    return `psdb:${this.appConfig.id}:s:${key}:${dateTime}${subTarget?':'+subTarget:''}`;
  }

  private aggregateData(rawData: JobStatsRange): [number, AggregatedData] {
    const aggregatedData: AggregatedData = {};
    let count = 0;
    Object.entries(rawData).forEach(([_, data]) => {
      for (const key in data) {
        if (key.startsWith('count:')) {
          const target = key.slice('count:'.length);
          if (!aggregatedData[target]) {
            aggregatedData[target] = 0;
          }
          aggregatedData[target] += data[key];
        } else if (key === 'count') {
          count += data[key];
        }
      }
    });
    return [count, aggregatedData];
  }

  private buildStatsResponse(rawData: JobStatsRange, redisKeys: string[], aggregatedData: AggregatedData, count: number, options: GetStatsOptions): StatsResponse {
    const measures: Measure[] = [];
    const measureKeys = Object.keys(aggregatedData).filter((key) => key !== "count");
    let segments = undefined;
    if (options.sparse !== true) {
      segments = this.handleSegments(rawData, redisKeys);
    }
    measureKeys.forEach((key) => {
      const measure: Measure = {
        target: key,
        type: "count",
        value: aggregatedData[key],
      };
      measures.push(measure);
    });
    const response: StatsResponse = {
      key: options.key,
      granularity: options.granularity,
      range: options.range,
      end: options.end,
      count,
      measures: measures,
    };
    if (segments) {
      response.segments = segments;
    }
    return response;
  }

  private handleSegments(data: JobStatsRange, hashKeys: string[]): Segment[] {
    const segments: Segment[] = [];
    hashKeys.forEach((hashKey, index) => {
      const segmentData: Measure[] = [];
      data[hashKey] && Object.entries(data[hashKey]).forEach(([key, value]) => {
        if (key.startsWith('count:')) {
          const target = key.slice('count:'.length);
          segmentData.push({ target, type: 'count', value });
        }
      });
      const isoTimestamp = this.isoTimestampFromKeyTimestamp(hashKey);
      const count = data[hashKey] ? data[hashKey].count : 0;
      segments.push({ count, time: isoTimestamp, measures: segmentData });
    });
    return segments;
  }

  private isoTimestampFromKeyTimestamp(hashKey: string): string {
    const keyTimestamp = hashKey.slice(-12);
    const year = keyTimestamp.slice(0, 4);
    const month = keyTimestamp.slice(4, 6);
    const day = keyTimestamp.slice(6, 8);
    const hour = keyTimestamp.slice(8, 10);
    const minute = keyTimestamp.slice(10, 12);
    return `${year}-${month}-${day}T${hour}:${minute}Z`;
  }

  async getIds(options: GetStatsOptions, facets: string[], idRange: [number, number] = [0, -1]): Promise<IdsResponse> {
    if (!facets.length) {
      const stats = await this.getStats(options);
      facets = this.getUniqueFacets(stats);
    }
    const { key, granularity, range, end, start } = options;
    this.validateOptions(options);
    let redisKeys: string[] = [];
    facets.forEach((facet) => {
      const dateTimeSets = this.generateDateTimeSets(granularity, range, end, start);
      redisKeys = redisKeys.concat(dateTimeSets.map((dateTime) => this.buildRedisKey(key, dateTime, `index:${facet}`)));
    });
    const idsData = await this.store.getJobIds(redisKeys, idRange);
    const idsResponse = this.buildIdsResponse(idsData, options, facets);
    return idsResponse;
  }

  private buildIdsResponse(idsData: IdsData, options: GetStatsOptions, facets: string[]): IdsResponse {
    const countsByFacet: { [key: string]: number } = {};
    const measureKeys = Object.keys(idsData);
    measureKeys.forEach((key) => {
      const target = this.getTargetForKey(key as string);
      const count = idsData[key].length;
  
      if (countsByFacet[target]) {
        countsByFacet[target] += count;
      } else {
        countsByFacet[target] = count;
      }
    });
    const counts: CountByFacet[] = Object.entries(countsByFacet).map(([facet, count]) => ({ facet, count }));
    const response: IdsResponse = {
      key: options.key,
      facets,
      granularity: options.granularity,
      range: options.range,
      start: options.start,
      counts,
      segments: this.buildTimeSegments(idsData),
    };
    return response;
  }

  private buildTimeSegments(idsData: IdsData): TimeSegment[] {
    const measureKeys = Object.keys(idsData);
    const timeSegments: { [time: string]: MeasureIds[] } = {};
  
    measureKeys.forEach((key) => {
      const measure: MeasureIds = {
        type: 'ids',
        target: this.getTargetForKey(key as string),
        time: this.isoTimestampFromKeyTimestamp(this.getTargetForTime(key as string)),
        count: idsData[key].length,
        ids: idsData[key],
      };
  
      if (timeSegments[measure.time]) {
        timeSegments[measure.time].push(measure);
      } else {
        timeSegments[measure.time] = [measure];
      }
    });
  
    const segments: TimeSegment[] = Object.entries(timeSegments).map(([time, measures]) => ({
      time,
      measures,
    }));
  
    return segments;
  }

  getUniqueFacets(data: StatsResponse): string[] {
    const targets = data.measures.map(measure => measure.target);
    return Array.from(new Set(targets));
  }

  getTargetForKey(key: string): string {
    return key.split(':index:')[1];
  }

  getTargetForTime(key: string): string {
    return key.split(':index:')[0];
  }

  async getWorkItems(options: GetStatsOptions, facets: string[]): Promise<string[]> {
    if (!facets.length) {
      const stats = await this.getStats(options);
      facets = this.getUniqueFacets(stats);
    }
    const { key, granularity, range, end, start } = options;
    this.validateOptions(options);
    let redisKeys: string[] = [];
    facets.forEach((facet) => {
      const dateTimeSets = this.generateDateTimeSets(granularity, range, end, start);
      redisKeys = redisKeys.concat(dateTimeSets.map((dateTime) => this.buildRedisKey(key, dateTime, `index:${facet}`)));
    });
    const idsData = await this.store.getJobIds(redisKeys, [0, 1]);
    const workerLists = this.buildWorkerLists(idsData);
    return workerLists;
  }

  private buildWorkerLists(idsData: IdsData): string[] {
    const workerLists: string[] = [];
    for (const key in idsData) {
      if (idsData[key].length) {
        workerLists.push(key);
      }
    }
    return workerLists;
  }
}

export { ReporterService };
