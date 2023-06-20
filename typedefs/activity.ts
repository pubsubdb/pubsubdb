import { MetricTypes } from "./stats";
import { StreamRetryPolicy } from "./stream";

type ActivityExecutionType = 'trigger' | 'await' | 'exec' | 'activity' | 'request' | 'iterate';

type Consumes = Record<string, string[]>;

interface ActivityBase {
  title?: string;
  type?: ActivityExecutionType;
  subtype?: string;
  input?: Record<string, any>;
  output?: Record<string, any>;
  settings?: Record<string, any>;
  job?: Record<string, any>;
  hook?: Record<string, any>;
  retry?: StreamRetryPolicy
  collationInt?: number;               //compiler
  dependents?: string[];               //compiler :legacy:
  depends?: Record<string, string[]>;  //compiler :legacy:
  consumes?: Consumes;                 //compiler :new:
  PRODUCES?: string[];                 //compiler :new:
  produces?: string[];                 //compiler :new:
  publishes?: string;                  //compiler 
  subscribes?: string;                 //compiler
  trigger?: string;                    //compiler
}

interface Measure {
  measure: MetricTypes;
  target: string;
}

interface TriggerActivityStats {
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
  ac: string;   //GMT created //activity_created
  au: string;   //GMT updated //activity_updated
  err?: string;  //stringified error json: {message: string, code: number, error?}
  jid?: string; //job_id :legacy:
  key?: string; //job_key :legacy:
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
  Consumes,
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
