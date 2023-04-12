type JobData = Record<string, unknown>;

type ActivityData = {
  data: Record<string, unknown>;
};

//this is the type as it exists in the running engine.
//in the remote key/value store, the key might contain some of this information
//such as the app `version` and `id`
type JobMetadata = {
  app_id: string;
  app_version: string;
  job_id: string;      //job id
  job_key?: string;    //job key
  time_series: string  //201203120005 (slice of time)
  job_created: string; //GMT created
  job_updated: string; //GMT updated
  job_status: number;  //15 digit number used for collation (HINCRBY-1: running, HINCRBY-2: completed, HINCRBY-4: skipped)
  activity_id: string; //activity id for trigger the spawned the job
  activity_type: string;
  activity_subtype: string;
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
