type JobData = Record<string, any>;
type JobMetadata = {
  id: string;
};

type JobContext = {
  data: JobData;
  metadata: JobMetadata;
}

export { JobContext, JobData, JobMetadata };
