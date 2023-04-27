type JobData = Record<string, unknown>;
type JobsData = Record<string, unknown>;

type ActivityData = {
  data: Record<string, unknown>;
};

type JobMetadata = {
  app: string;  //app_id
  vrs: string;  //app version
  jid: string;  //job_id
  key?: string; //job_key
  ts: string    //201203120005 (slice of time) //time series
  jc: string;   //GMT created //job_created
  ju: string;   //GMT updated //job_updated
  js: number;   //job_status 15 digit number used for collation
  aid: string;  //activity_id for trigger the spawned the job
  atp: string;  //activity_type
  stp: string;  //activity_subtype
};

type JobContext = {
  metadata: JobMetadata;
  data: JobData;
  [activityId: symbol]: {
    input: ActivityData;
    output: ActivityData;
    settings: ActivityData;
    errors: ActivityData;
  };
};

export { JobContext, JobData, JobsData, JobMetadata };
