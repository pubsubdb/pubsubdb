type JobData = Record<string, unknown>;

type ActivityData = {
  data: Record<string, unknown>;
};

//this is the type as it exists in the running engine.
//in the remote key/value store, the key might contain some of this information
//such as the app `version` and `id`
type JobMetadata = {
  app: string; //app_id
  vrs: string; //app version
  jid: string;      //job_id
  key?: string;    //job_key
  ts: string  //201203120005 (slice of time) //time series
  jc: string; //GMT created //job_created
  ju: string; //GMT updated //job_updated
  js: number;  //job_status 15 digit number used for collation (HINCRBY-1: running, HINCRBY-2: completed, HINCRBY-4: skipped)
  aid: string; //activity_id for trigger the spawned the job
  atp: string; //activity_type
  stp: string; //activity_subtype
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

export { JobContext, JobData, JobMetadata };
