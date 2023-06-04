import { PipeItem } from "./pipe";
import { MetricTypes } from "./stats";

type ActivityExecutionType = 'trigger' | 'await' | 'exec' | 'activity' | 'request' | 'iterate';

interface ActivityBase {
  title?: string;
  type?: ActivityExecutionType;
  subtype?: string;
  input?: Record<string, any>;
  output?: Record<string, any>;
  settings?: Record<string, any>;
  dependents?: string[];
  depends?: Record<string, string[]>;
  hook?: Record<string, any>;
  collationInt?: number;
  job?: Record<string, any>;
  publishes?: string; //set by compiler
}

interface Measure {
  measure: MetricTypes;
  target: string;
}

interface TriggerActivityStats {
  granularity?: string; //5m is default
  id?: { [key: string]: unknown } | string;
  key?: { [key: string]: unknown } | string;
  measures?: Measure[]; //what to capture
}

interface TriggerActivity extends ActivityBase {
  type: 'trigger';
  stats?: TriggerActivityStats;
  collationKey?: number;
}

interface AwaitActivity extends ActivityBase {
  type: 'await';
  eventName: string;
  timeout: number;
}

interface ExecActivity extends ActivityBase {
  type: 'exec';
  subtype: string;
  timeout: number;
}

interface RequestActivity extends ActivityBase {
  type: 'request';
}

interface IterateActivity extends ActivityBase {
  type: 'iterate';
}

type ActivityType = ActivityBase | TriggerActivity | AwaitActivity | ExecActivity | RequestActivity | IterateActivity;

type ActivityData = Record<string, any>;
type ActivityMetadata = {
  aid: string;  //activity_id
  atp: string;  //activity_type
  stp: string;  //activity_subtype
  jid?: string; //job_id
  key?: string; //job_key
  ac: string;   //GMT created //activity_created
  au: string;   //GMT updated //activity_updated
};

type HookData = Record<string, any>;

type ActivityContext = {
  data?: ActivityData | null;
  metadata: ActivityMetadata;
  hook?: HookData
};

type FlattenedDataObject = {
  [key: string]: string
};

type ActivityDataType = {
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  hook?: Record<string, unknown>;
};

export {
  ActivityType,
  ActivityDataType,
  ActivityContext,
  ActivityData,
  ActivityMetadata,
  HookData,
  ActivityBase as BaseActivity,
  TriggerActivity,
  TriggerActivityStats,
  AwaitActivity,
  ExecActivity,
  RequestActivity,
  IterateActivity,
  FlattenedDataObject
};
