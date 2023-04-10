type ActivityExecutionType = 'trigger' | 'await' | 'job' | 'openapi';

interface ActivityBase {
  title: string;
  type: ActivityExecutionType;
  subtype: string;
  input?: Record<string, any>;
  output?: Record<string, any>;
  settings?: Record<string, any>;
}

interface TriggerActivity extends ActivityBase {
  type: 'trigger';
  stats?: Record<string, any>;
  job?: Record<string, any>;
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

type ActivityType = TriggerActivity | AwaitActivity | JobActivity;

type ActivityData = Record<string, any>;
type ActivityMetadata = {
  activity_id: string;
  type: string;
  subtype: string;
  job_id?: string;
};

type ActivityContext = {
  data: ActivityData;
  metadata: ActivityMetadata;
}

export { ActivityType, ActivityContext, ActivityData, ActivityMetadata, TriggerActivity, AwaitActivity, JobActivity };
