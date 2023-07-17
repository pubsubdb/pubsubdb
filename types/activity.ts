import { MetricTypes } from "./stats";
import { StreamRetryPolicy } from "./stream";

type ActivityExecutionType = 'trigger' | 'await' | 'worker' | 'activity' | 'request' | 'iterate';

type Consumes = Record<string, string[]>;

interface BaseActivity {
  title?: string;
  type?: ActivityExecutionType;
  subtype?: string;
  input?: Record<string, any>;
  output?: Record<string, any>;
  settings?: Record<string, any>;
  job?: Record<string, any>;
  hook?: Record<string, any>;
  sleep?: number;                      //compiler (in seconds)
  expire?: number;                     //compiler (in seconds) -1 forever, 15|60 default (seconds)
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

interface TriggerActivity extends BaseActivity {
  type: 'trigger';
  stats?: TriggerActivityStats;
  collationKey?: number;
}

interface AwaitActivity extends BaseActivity {
  type: 'await';
  eventName: string;
  timeout: number;
}

interface WorkerActivity extends BaseActivity {
  type: 'worker';
  subtype: string;
  timeout: number;
}

interface RequestActivity extends BaseActivity {
  type: 'request';
}

interface IterateActivity extends BaseActivity {
  type: 'iterate';
}

type ActivityType = BaseActivity | TriggerActivity | AwaitActivity | WorkerActivity | RequestActivity | IterateActivity;

type ActivityData = Record<string, any>;
type ActivityMetadata = {
  aid: string;  //activity_id
  atp: string;  //activity_type
  stp: string;  //activity_subtype
  ac: string;   //GMT created //activity_created
  au: string;   //GMT updated //activity_updated
  err?: string; //stringified error json: {message: string, code: number, error?}
  jid?: string; //job_id :legacy:
  key?: string; //job_key :legacy:
};

type ActivityContext = {
  data?: ActivityData | null;
  metadata: ActivityMetadata;
  hook?: ActivityData
};

type ActivityDataType = {
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  hook?: Record<string, unknown>;
};

export {
  ActivityContext,
  ActivityData,
  ActivityDataType,
  ActivityMetadata,
  ActivityType,
  Consumes,
  TriggerActivityStats,
  AwaitActivity,
  BaseActivity,
  IterateActivity,
  RequestActivity,
  TriggerActivity,
  WorkerActivity
};
