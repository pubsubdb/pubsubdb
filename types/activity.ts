import { MetricTypes } from "./stats";
import { StreamRetryPolicy } from "./stream";

type ActivityExecutionType = 'trigger' | 'await' | 'worker' | 'activity' | 'emit' | 'iterate';

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
  telemetry?: Record<string, any>;
  sleep?: number;                      //@pipe /in seconds
  expire?: number;                     //-1 forever (15 seconds default); todo: make globally configurable
  retry?: StreamRetryPolicy
  collationInt?: number;               //compiler
  consumes?: Consumes;                 //compiler
  PRODUCES?: string[];                 //compiler
  produces?: string[];                 //compiler
  publishes?: string;                  //compiler 
  subscribes?: string;                 //compiler
  trigger?: string;                    //compiler
  parent?: string;                     //compiler
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
}

interface AwaitActivity extends BaseActivity {
  type: 'await';
  eventName: string;
  timeout: number;
}

interface WorkerActivity extends BaseActivity {
  type: 'worker';
  topic: string;
  timeout: number;
}

interface EmitActivity extends BaseActivity {
  type: 'emit';
}

interface IterateActivity extends BaseActivity {
  type: 'iterate';
}

type ActivityType = BaseActivity | TriggerActivity | AwaitActivity | WorkerActivity | EmitActivity | IterateActivity;

type ActivityData = Record<string, any>;
type ActivityMetadata = {
  aid: string;  //activity_id
  atp: string;  //activity_type
  stp: string;  //activity_subtype
  ac: string;   //GMT created //activity_created
  au: string;   //GMT updated //activity_updated
  err?: string; //stringified error json: {message: string, code: number, error?}
  l1s?: string; //open telemetry span context (leg 1)
  l2s?: string; //open telemetry span context (leg 2)
  as?: string;  //describes the activity status. 9999000000
};

//NOTE:  use 4-digit collation integer to track the 4 leg states
//          9999 + 000000 to track the dimensional thread count
//        * leg1 ENTRY is digit 1   +--<--+    //hincrby -1
//        * leg1 EXIT  is digit 2   |     |    //hincrby -10
//        * leg2 ENTRY is digit 3   v     ^    //hincrby -100
//        * leg2 EXIT  is digit 4   |     |    //hincrby -1000
//        * leg1 MARK               +-->--+    //create the initial 4-digit for next gen (9999)

//NOTE: The ancestor thread index (as) ensures clean handoffs by providing entry/exit signing
//      The "signatures" are expressed as semaphores where one activity enters
//      a value in the ledger while subsequent steps modify and add entries of their own
//      The act of writing to activity semaphores (as) at ENTRY and EXIT points of
//      each execution leg guarantees against race conditions while also preventing
//      stalled processes

//      symbol keys (AAA, ABC, ABC) represent the original JSON object path
//      The symbols will be appended with the 
//        * AAA resolves to `t1/metadata/as` (`AAA,0`         = `t1/metadata/as,0`)
//        * ABA resolves to `a1/metadata/as` (`ABA,0,0`       = `a1/metadata/as,0,0`)
//        * ACA resolves to `a2/metadata/as` (`ACA,0,0,0,0`   = `a2/metadata/as,0,0,0,0`)


//      !!! TODO: remove as up until first non-zero character !!!

//      TRIGGER (needs to verify unique job id)
//      t1 (leg2 ENTRY) `HSETNX <jobId>   'AAA,0'     0`
//      t1 (leg2 EXIT)  `HSET   <jobId>   'AAA,0'     1`
//      && (leg1 MARK)  `HSET   <jobId>   'ABA,0,0'  -1`               // *preset 'as' metadata placeholder for children (a1)
//          a1 (leg1 ENTRY)  `HINCRBY  <jobId>  'ABA,0,0'     1`       // *if return != 0, call `HGET <jobId> ABA,0,0,` to confirm not null and >= -1. Re-run if `(leg1 EXIT)` did NOT execute
//          a1 (leg1 EXIT)   `HSET     <jobId>  'ABA,0,0'    -1`       // *include trailing comma (this is the dimensional thread counter)
//          ...              ...
//          ...  a1 do work  ...
//          ...              ...

//          IF (status == pending && code == 200) =>
//          a1 (leg2 ENTRY)  `HINCRBY  <jobId>  'ABA,0,0,'     1`                         // *include trailing comma (return value determines as for leg2 of self and descendants)
//          a1 (leg2 EXIT)   `HINCRBY  <jobId>  'ABA,0,0,0'    1`                         // * the last 0 is used, because is return from prior
//          && (leg1 MARK)   `HSET     <jobId>  'ACA,0,0,0,0' -1`                         // *preset 'as' metadata placeholder for children (a2)
//                a2 (leg1 ENTRY) `HINCRBY  <jobId>  'ACA,0,0,0,0'    1`                  // *if return != 0, call `HGET <jobId> ACA,0,0,0|0,` to confirm not null and >= -1. Re-run if `(leg1 EXIT)` did NOT execute
//                a2 (leg1 EXIT)  `HSET     <jobId>  'ACA,0,0,0,0'   -1`                  // *include trailing comma

//          IF (status == success && code == 200) =>
//          a1 (leg2 ENTRY)  `HINCRBY  <jobId>  'ABA,0,0,'     1`                         // *include trailing comma (return value determines as for leg2 of self and descendants)
//          a1 (leg2 EXIT)   `HINCRBY  <jobId>  'ABA,0,0,1'    1`                         //value to use
//          && (leg1 MARK)   `HSET     <jobId>  'ACA,0,0,1,0' -1`                         // *preset 'as' metadata placeholder for children (a2)
//                a2 (leg1 ENTRY) `HINCRBY  <jobId>  'ACA,0,0,1,0'    1`                  // *if return != 0, call `HGET <jobId> ACA,0,0,0|0,` to confirm not null and >= -1. Re-run if `(leg1 EXIT)` did NOT execute
//                a2 (leg1 EXIT)  `HSET     <jobId>  'ACA,0,0,1,0'   -1`                  // *include trailing comma

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

type ActivityLeg = 1 | 2;

export {
  ActivityContext,
  ActivityData,
  ActivityDataType,
  ActivityLeg,
  ActivityMetadata,
  ActivityType,
  Consumes,
  TriggerActivityStats,
  AwaitActivity,
  BaseActivity,
  EmitActivity,
  IterateActivity,
  TriggerActivity,
  WorkerActivity
};
