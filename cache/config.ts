//every namespace will be prefixed with this namespace
const PUBSUBDB_NAMESPACE = "ps";

const NAMESPACES = {
  PUBSUBDB: `${PUBSUBDB_NAMESPACE}db`,                    //pubsubdb manifest (in Redis: `psdb:`)
  JOB_DATA: `${PUBSUBDB_NAMESPACE}job`,                   //job data
  JOB_METADATA: `${PUBSUBDB_NAMESPACE}jobmd`,             //job metadata
  JOB_STATISTICS: `${PUBSUBDB_NAMESPACE}jobstats`,        //job statistics (aggregated job data)
  ACTIVITY_DATA: `${PUBSUBDB_NAMESPACE}activity`,         //raw activity data
  ACTIVITY_METADATA: `${PUBSUBDB_NAMESPACE}activitymd`,   //activity metadata
  ACTIVITY_SCHEMAS: `${PUBSUBDB_NAMESPACE}schemas`,       //schemas (always indexed by topic)
  SUBSCRIPTION_PATTERNS: `${PUBSUBDB_NAMESPACE}patterns`, //pspatterns:order.created: cached locally for faster lookup
  SUBSCRIPTIONS: `${PUBSUBDB_NAMESPACE}subscriptions`,    //called using subscription ids resolved by applying `patterns` to published data
};

export { NAMESPACES, PUBSUBDB_NAMESPACE };
