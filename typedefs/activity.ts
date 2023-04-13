type ActivityExecutionType = 'trigger' | 'await' | 'job' | 'openapi' | 'request' | 'iterate';

interface ActivityBase {
  title: string;
  type: ActivityExecutionType;
  subtype: string;
  input?: Record<string, any>;
  output?: Record<string, any>;
  settings?: Record<string, any>;
  dependents?: string[];
  hook?: Record<string, any>;
}

interface TriggerActivity extends ActivityBase {
  type: 'trigger';
  stats?: Record<string, any>;
  job?: Record<string, any>;
  sortedActivityIds?: string[];
}

interface AwaitActivity extends ActivityBase {
  type: 'await';
  eventName: string;
  timeout: number;
}

interface OpenAPIActivity extends ActivityBase {
  type: 'openapi';
  timeout: number;
}

interface RequestActivity extends ActivityBase {
  type: 'request';
}

interface IterateActivity extends ActivityBase {
  type: 'iterate';
}

interface AwaitActivity extends ActivityBase {
  type: 'await';
  eventName: string;
  timeout: number;
}

interface JobActivity extends ActivityBase {
  type: 'job';
  job?: Record<string, any>;
}

type ActivityType = TriggerActivity | AwaitActivity | JobActivity | OpenAPIActivity | RequestActivity | IterateActivity;

type ActivityData = Record<string, any>;
type ActivityMetadata = {
  aid: string; //activity_id
  atp: string; //activity_type
  stp: string; //activity_subtype
  jid?: string; //job_id
  ac: string; //GMT created //activity_created
  au: string; //GMT updated //activity_updated
};

type ActivityContext = {
  data: ActivityData;
  metadata: ActivityMetadata;
}

export { ActivityType, ActivityContext, ActivityData, ActivityMetadata, TriggerActivity, AwaitActivity, JobActivity, OpenAPIActivity, RequestActivity, IterateActivity };
