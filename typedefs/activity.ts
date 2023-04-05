type ActivityConfig = {
  id: string;
  title?: string;
  type: string;
  subtype: string;
};

type ActivityData = Record<string, any>;
type ActivityMetadata = {
  id: string;
  job_id: string;
  type: string;
  subtype: string;
};

type ActivityContext = {
  data: ActivityData;
  metadata: ActivityMetadata;
}

export { ActivityConfig, ActivityContext, ActivityData, ActivityMetadata };
