//default namespace for pubsubdb
const PSNS = "psdb";

//the key types are used to create a unique key per entity
enum KeyType {
  PUBSUBDB,
  APP,
  JOB_DATA,
  JOB_ACTIVITY_DATA,
  JOB_STATS_GENERAL,
  JOB_STATS_MEDIAN,
  JOB_STATS_INDEX,
  SCHEMAS,
  SUBSCRIPTIONS,
  SUBSCRIPTION_PATTERNS,
  HOOKS,
  SIGNALS,
}

//when minting a key, the following parameters are used to create a unique key per entity
type KeyStoreParams = {
  appId?: string;       //app id is a uuid for a given pubsubdb app
  appVersion?: string;  //(e.g. "1.0.0", "1", "1.0")
  jobId?: string;       //a customer-defined id for job; must be unique for the entire app
  activityId?: string;  //activity id is a uuid for a given pubsubdb app
  jobKey?: string;      //a customer-defined label for a job that serves to categorize events 
  dateTime?: string;    //UTC date time: YYYY-MM-DDTHH:MM (20203-04-12T00:00); serves as a time-series bucket for the job_key
  facet?: string;       //data path starting at root with values separated by colons (e.g. "object/type:bar")
};

class KeyStore {

  /**
   * returns a key that can be used to access a value in the key/value store
   * appropriate for the given key type; the keys have an implicit hierarchy
   * and are used to organize data in the store in a tree-like structure
   * via the use of colons as separators. The top-level entity is the psdb manifest.
   * This file will reveal the full scope of what is on the server (apps, versions, etc)
   * @param namespace 
   * @param keyType 
   * @param params 
   * @returns {string}
   */
  static mintKey(namespace: string, keyType: KeyType, params: KeyStoreParams): string {
    switch (keyType) {
      case KeyType.PUBSUBDB:
        return namespace;
      case KeyType.APP:
        // the term 'app' must be reserved due to naked paths for job and activity keys
        return `${namespace}:a:${params.appId || ''}`;
      case KeyType.JOB_DATA:
        return `${namespace}:${params.appId}:j:${params.jobId}`;
      case KeyType.JOB_ACTIVITY_DATA:
        return `${namespace}:${params.appId}:j:${params.jobId}:${params.activityId}`;
      case KeyType.JOB_STATS_GENERAL:
        return `${namespace}:${params.appId}:s:${params.jobKey}:${params.dateTime}`;
      case KeyType.JOB_STATS_MEDIAN:
        return `${namespace}:${params.appId}:s:${params.jobKey}:${params.dateTime}:${params.facet}`;
      case KeyType.JOB_STATS_INDEX:
        return `${namespace}:${params.appId}:s:${params.jobKey}:${params.dateTime}:${params.facet}`;
      case KeyType.SCHEMAS:
        return `${namespace}:${params.appId}:v:${params.appVersion}:schemas`;
      case KeyType.SUBSCRIPTIONS:
        return `${namespace}:${params.appId}:v:${params.appVersion}:subscriptions`;
      case KeyType.SUBSCRIPTION_PATTERNS:
        return `${namespace}:${params.appId}:v:${params.appVersion}:transitions`;
      case KeyType.HOOKS:
        //`hooks` provide the pattern to resolve a value
        return `${namespace}:${params.appId}:hooks`;
      case KeyType.SIGNALS:
        //`signals` provide the registry of resolved values that link back to paused jobs
        return `${namespace}:${params.appId}:signals`;
      default:
        throw new Error("Invalid key type.");
    }
  }
}

export { KeyStore, KeyType, KeyStoreParams, PSNS };

//key/value namespace hierarchy
/**
 * psdb ->                                            {hash}    pubsubdb config {version: "0.0.1", namespace: "psdb"}
 * psdb:apps:<appid> ->                               {hash}    app profile { "id": "appid", "version": "2", "versions/1": "GMT", "versions/2": "GMT"}
 * psdb:<appid>:job:<jobid> ->                        {hash}    job data
 * psdb:<appid>:job:<jobid>:act:<activityId>  ->      {hash}    job activity data (a1)
 * psdb:<appid>:job:<jobkey>:<dateTime>:stats ->      {hash}    job stats (general)
 * psdb:<appid>:job:<jobkey>:<dateTime>:stats:mdn ->  {zset}    job stats (median)
 * psdb:<appid>:job:<jobkey>:<dateTime>:stats:idx ->  {list}    job stats (index of jobid[])
 * psdb:<appid>:vrs:<version>:schemas ->              {hash}    schemas
 * psdb:<appid>:vrs:<version>:transitions ->          {hash}    subscription patterns [cache]
 * psdb:<appid>:vrs:<version>:subscriptions ->        {hash}    subscriptions [cache]
 * psdb:<appid>:vrs:<version>:hooks ->                {hash}    hook patterns [cache] (used to create a skeleton key to locate dynamic hooks in the Redis `hooks` hash)
 * psdb:<appid>:hooks ->                              {hash}    hooks (dynamic); expunged when found; never versioned (external caller has no sense of release schedules or versions)
 */


//enums
/**
 * version:  app version
 * appid:    app id
 * jobid:    either a random guid based upon time or explicit passed as rule in graph
 * jobkey:   if present, job stats will be captured at a default granilarity of 1h
 * dateTime: date/time (20230312000000) GMT slice, representing a time like midnight, 1am, 2am, etc
 */