type MetricTypes = 'count' | 'sum' | 'avg' | 'mdn' | 'max' | 'min' | 'index';

interface Stat {
  target: string;       //e.g, (a target on the input data: `<activity>.input.data`) => {`object/type:widgetA|widgetB:sum`: <sum>}, {`object/type:widgetA|widgetB:count`: <count>}
  metric: MetricTypes;  //count, avg, etc
  value: number|string; //a value to increment (sum); value to save to sorted set (mdn) or an id to add to an `index` or just '1' for a count
}

interface StatsType {
  general: Stat[];
  index: Stat[];
  median: Stat[];
}

export { StatsType, Stat, MetricTypes };
