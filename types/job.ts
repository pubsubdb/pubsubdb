type JobData = Record<string, unknown|Record<string, unknown>>;
type JobsData = Record<string, unknown>;

type ActivityData = {
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

type JobMetadata = {
  ngn?: string; //engine guid (one time subscriptions)
  tpc: string;  //subscription topic
  pj?: string;  //parent_job_id
  pa?: string;  //parent_activity_id
  key?: string; //job_key
  app: string;  //app_id
  vrs: string;  //app version
  jid: string;  //job_id
  ts: string    //201203120005 (slice of time) //time series
  jc: string;   //GMT created //job_created
  ju: string;   //GMT updated //job_updated
  js: number;   //job_status 15 digit number used for collation
  aid: string;  //activity_id for trigger the spawned the job
  atp: string;  //activity_type
  stp: string;  //activity_subtype
  err?: string; //stringified job error json: {message: string, code: number, error?}
  del?: number; //process data del policy
};

type JobState = {
  metadata: JobMetadata;
  data: JobData;
  [activityId: symbol]: {
    input: ActivityData;
    output: ActivityData;
    hook: ActivityData;
    settings: ActivityData;
    errors: ActivityData;
  };
};

//format when publishing job meta/data on the wire when it completes
type JobOutput = {
  metadata: JobMetadata;
  data: JobData;
};

//the minimum info needed to restore/resume a job in context
//(e.g., a webhook signal needs this to restore the job context)
type PartialJobState = {
  metadata: Partial<JobMetadata> & Pick<JobMetadata, 'aid' | 'jid'>;
  data: JobData;
}

export { JobState, JobData, JobsData, JobMetadata, PartialJobState, JobOutput };
