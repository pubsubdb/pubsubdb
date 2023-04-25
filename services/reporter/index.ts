import { GetStatsOptions, StatsResponse, AggregatedData, Measure, Segment, JobStatsRange } from '../../typedefs/stats';
import { ILogger } from '../logger';
import { StoreService as Store } from '../store';

class ReporterService {
  private appId: string;
  private appVersion: string;
  private logger: ILogger;
  private store: Store;

  constructor(appId: string, appVersion: string, store: Store, logger: ILogger) {
    this.appId = appId;
    this.appVersion = appVersion;
    this.logger = logger;
    this.store = store;
  }

  getAppConfig() {
    return { id: this.appId, version: this.appVersion };
  }

  async getStats(options: GetStatsOptions): Promise<StatsResponse> {
    this.logger.debug('get_stats', options);
    const { key, granularity, range, end, start } = options;
    this.validateOptions(options);
    const dateTimeSets = this.generateDateTimeSets(granularity, range, end, start);
    const redisKeys = dateTimeSets.map((dateTime) => this.buildRedisKey(dateTime, key));
    const rawData = await this.store.getJobStats(redisKeys, this.getAppConfig());
    const [count, aggregatedData] = this.aggregateData(rawData);
    const statsResponse = this.buildStatsResponse(rawData, redisKeys, aggregatedData, count, options);
    return statsResponse;
  }

  private validateOptions(options: GetStatsOptions): void {
    const { start, end, range } = options;
    if ((start && end && range) || (!start && !end && !range)) {
      throw new Error('Invalid combination of start, end, and range values. Provide either start+end, end+range, or start+range.');
    }
  }
  private generateDateTimeSets(granularity: string, range: string, end: string, start?: string): string[] {
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
      endTime = new Date(startTime.getTime() + (rangeMinutes * 60 * 1000));
    } else {
      endTime = end === 'NOW' ? new Date() : new Date(end);
      startTime = new Date(endTime.getTime() - (rangeMinutes * 60 * 1000));
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

  private buildRedisKey(dateTime: string, key: string): string {
    return `psdb:${this.appId}:s:${key}:${dateTime}`;
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
    const segments = this.handleSegments(rawData, redisKeys);  
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
      segments,
    };
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
}

export { ReporterService };
