//default namespace for pubsubdb
const PSNS = "psdb";

//the key types are used to create a unique key per entity
enum KeyType {
  PUBSUBDB,
  APP,
  JOB_DATA,
  JOB_METADATA,
  JOB_ACTIVITY_DATA,
  JOB_ACTIVITY_METADATA,
  JOB_STATS_GENERAL,
  JOB_STATS_MEDIAN,
  JOB_STATS_INDEX,
  SCHEMAS,
  SUBSCRIPTIONS,
  SUBSCRIPTION_PATTERNS,
  HOOKS,
  HOOK_PATTERNS,
}

//when minting a key, the following parameters are used to create a unique key per entity
type KeyStoreParams = {
  appId?: string;       //app id is a uuid for a given pubsubdb app
  appVersion?: string; //(e.g. "1.0.0", "1", "1.0")
  jobId?: string;      //a customer-defined id for job; must be unique for the entire app
  activityId?: string; //activity id is a uuid for a given pubsubdb app
  jobKey?: string;   //a customer-defined label for a job that serves to categorize events 
  dateTime?: string; //UTC date time: YYYY-MM-DDTHH:MM (20203-04-12T00:00); serves as a time-series bucket for the job_key
  facet?: string;    //data path starting at root with values separated by colons (e.g. "object/type:bar")
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
        return `${namespace}:app:${params.appId || ''}`;
      case KeyType.JOB_DATA:
        return `${namespace}:${params.appId}:job:${params.jobId}:data`;
      case KeyType.JOB_METADATA:
        return `${namespace}:${params.appId}:job:${params.jobId}:mdata`;
      case KeyType.JOB_ACTIVITY_DATA:
        return `${namespace}:${params.appId}:job:${params.jobId}:act:${params.activityId}:data`;
      case KeyType.JOB_ACTIVITY_METADATA:
        return `${namespace}:${params.appId}:job:${params.jobId}:act:${params.activityId}:mdata`;
      case KeyType.JOB_STATS_GENERAL:
        return `${namespace}:${params.appId}:job:${params.jobKey}:${params.dateTime}:stats:gen`;
      case KeyType.JOB_STATS_MEDIAN:
        //median uses ZSET; must add the attribute being tracked to the Redis key to isolate
        return `${namespace}:${params.appId}:job:${params.jobKey}:${params.dateTime}:stats:mdn:${params.facet}`;
      case KeyType.JOB_STATS_INDEX:
        //index uses LIST; must add the attribute being indexed to the Redis key to isolate
        return `${namespace}:${params.appId}:job:${params.jobKey}:${params.dateTime}:stats:idx:${params.facet}`;
      case KeyType.SCHEMAS:
        return `${namespace}:${params.appId}:vrs:${params.appVersion}:schemas`;
      case KeyType.SUBSCRIPTIONS:
        return `${namespace}:${params.appId}:vrs:${params.appVersion}:subs`;
      case KeyType.SUBSCRIPTION_PATTERNS:
        return `${namespace}:${params.appId}:vrs:${params.appVersion}:subpats`;
      case KeyType.HOOK_PATTERNS:
        return `${namespace}:${params.appId}:vrs:${params.appVersion}:hookpats`;
      case KeyType.HOOKS:
        return `${namespace}:${params.appId}:hooks`;
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
 * psdb:<appid>:job:<jobid>:data ->                   {hash}    job data
 * psdb:<appid>:job:<jobid>:mdata ->                  {hash}    job metadata
 * psdb:<appid>:job:<jobid>:act:<activityId>:data ->  {hash}    job activity data (a1)
 * psdb:<appid>:job:<jobid>:act:<activityId>:mdata -> {hash}    job activity metadata (a1)
 * psdb:<appid>:job:<jobkey>:<dateTime>:stats:gen ->  {hash}    job stats (general)
 * psdb:<appid>:job:<jobkey>:<dateTime>:stats:mdn ->  {zset}    job stats (median)
 * psdb:<appid>:job:<jobkey>:<dateTime>:stats:idx ->  {list}    job stats (index of jobid[])
 * psdb:<appid>:vrs:<version>:schemas ->              {hash}    schemas
 * psdb:<appid>:vrs:<version>:subpats ->              {hash}    subscription patterns [cache]
 * psdb:<appid>:vrs:<version>:subs ->                 {hash}    subscriptions [cache]
 * psdb:<appid>:vrs:<version>:hookpats ->             {hash}    hook patterns [cache] (used to create a skeleton key to locate dynamic hooks in the Redis `hooks` hash)
 * psdb:<appid>:hooks ->                              {hash}    hooks (dynamic); expunged when found; never versioned (external caller has no sense of release schedules or versions)
 */


//enums
/**
 * version:  app version
 * appid:    app id
 * jobid:    either a random guid based upon time or explicit passed as rule in graph
 * jobkey:   if present, job stats will be captured at a default granilarity of 1h
 * dateTime: date/time (2023-03-12T00:00:00) GMT slice, representing a time like midnight, 1am, 2am, etc
 */