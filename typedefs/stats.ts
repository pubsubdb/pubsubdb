type MetricTypes = 'count' | 'sum' | 'avg' | 'mdn' | 'max' | 'min' | 'index';

interface Stat {
  target: string;       //e.g, (a target on the input data: `<activity>.input.data`) => {`object/type:widgetA|widgetB:sum`: <sum>}, {`object/type:widgetA|widgetB:count`: <count>}
  metric: MetricTypes;  //count, avg, etc
  value: number|string; //a value to increment (sum); value to save to sorted set (mdn) or an id to add to an `index` or just '1' for a count
}

interface Measure {
  target: string;
  type: string;
  value: number;
}

interface Segment {
  time: string;
  count: number;
  measures: Measure[];
}

interface StatsType {
  general: Stat[];
  index: Stat[];
  median: Stat[];
}

interface JobStats {
  count?: number;
  [field: string]: number;
}

interface JobStatsRange {
  [key: string]: JobStats
}

interface GetStatsOptions {
  key: string;
  granularity?: string;
  range?: string;
  start?: string;
  end?: string;
}

interface StatsResponse {
  key: string;
  granularity: string;
  range: string;
  end: string | Date;
  count: number;
  measures: Measure[];
  segments: Segment[];
}

interface AggregatedData {
  [key: string]: number;
}

export { StatsType, Stat, MetricTypes, JobStats, JobStatsRange, GetStatsOptions, StatsResponse, AggregatedData, Measure, Segment };
