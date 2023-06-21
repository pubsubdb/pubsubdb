/**
 * Keys
 * 
 * psdb ->                                            {hash}    pubsubdb config {version: "0.0.1", namespace: "psdb"}
 * psdb:a:<appid> ->                                  {hash}    app profile { "id": "appid", "version": "2", "versions/1": "GMT", "versions/2": "GMT"}
 * psdb:<appid>:e:<engineId> ->                       {string}  setnx to ensure only one engine of given id
 * psdb:<appid>:w: ->                                 {zset}    work items/tasks an engine must do like garbage collect or hook a set of matching records (hookAll)
 * psdb:<appid>:d: ->                                 {zset}    an orders set of time slice lists that have 1+ jobs to delete
 * psdb:<appid>:d:<timeValue?> ->                     {list}    job ids to delete for the slice of time
 * psdb:<appid>:q: ->                                 {hash}    quorum-wide messages
 * psdb:<appid>:q:<ngnid> ->                          {hash}    engine-targeted messages (targeted quorum-oriented message)
 * psdb:<appid>:j:<jobid> ->                          {hash}    job data
 * psdb:<appid>:j:<jobid>:<activityid>  ->            {hash}    job activity data (a1)
 * psdb:<appid>:s:<jobkey>:<dateTime> ->              {hash}    job stats (general)
 * psdb:<appid>:s:<jobkey>:<dateTime>:mdn:<field/path>:<fieldvalue> ->      {zset}    job stats (median)
 * psdb:<appid>:s:<jobkey>:<dateTime>:index:<field/path>:<fieldvalue> ->    {list}    job stats (index of jobid[])
 * psdb:<appid>:v:<version>:activities ->             {hash}    schemas [cache]
 * psdb:<appid>:v:<version>:transitions ->            {hash}    transitions [cache]
 * psdb:<appid>:v:<version>:subscriptions ->          {hash}    subscriptions [cache]
 * psdb:<appid>:x: ->                                 {xstream} when an engine is sent or reads a buffered task (engines read from their custom topic)
 * psdb:<appid>:x:<topic> ->                          {xstream} when a worker is sent or reads a buffered task (workers read from their custom topic)
 * psdb:<appid>:hooks ->                              {hash}    hook patterns/rules; set at compile time
 * psdb:<appid>:signals ->                            {hash}    dynamic hook signals (hget/hdel) when resolving (always self-clean); added/removed at runtime
 * psdb:<appid>:sym:keys: ->                          {hash}    list of symbol ranges and :cursor assigned at version deploy time for job keys
 * psdb:<appid>:sym:keys:<activityid|$subscribes> ->  {hash}    list of symbols based upon schema enums (initially) and adaptively optimized (later) during runtime; if '$subscribes' is used as the activityid, it is a top-level `job` symbol set (for job keys)
 * psdb:<appid>:sym:vals: ->                          {hash}    list of symbols for job values across all app versions
 */

//default namespace for pubsubdb
const PSNS = "psdb";

//these are the entity types that are stored in the key/value store
enum KeyType {
  APP,
  DELETE_RANGE,
  ENGINE_ID,
  HOOKS,
  JOB_STATE,
  JOB_STATS_GENERAL,
  JOB_STATS_MEDIAN,
  JOB_STATS_INDEX,
  PUBSUBDB,
  QUORUM,
  SCHEMAS,
  SIGNALS,
  STREAMS,
  SUBSCRIPTIONS,
  SUBSCRIPTION_PATTERNS,
  SYMKEYS,
  SYMVALS,
  WORK_ITEMS,
}

//when minting a key, the following parameters are used to create a unique key per entity
type KeyStoreParams = {
  appId?: string;       //app id is a uuid for a pubsubdb app
  engineId?: string;    //unique auto-generated guid for an ephemeral engine instance
  appVersion?: string;  //(e.g. "1.0.0", "1", "1.0")
  jobId?: string;       //a customer-defined id for job; must be unique for the entire app
  activityId?: string;  //activity id is a uuid for a given pubsubdb app
  jobKey?: string;      //a customer-defined label for a job that serves to categorize events 
  dateTime?: string;    //UTC date time: YYYY-MM-DDTHH:MM (20203-04-12T00:00); serves as a time-series bucket for the job_key
  facet?: string;       //data path starting at root with values separated by colons (e.g. "object/type:bar")
  topic?: string;       //topic name (e.g., "foo" or "" for top-level)
  timeValue?: number;   //time value (rounded to minute) (for delete range)
};

class KeyService {

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
      case KeyType.ENGINE_ID:
        return `${namespace}:${params.appId}:e:${params.engineId}`;
      case KeyType.WORK_ITEMS:
        return `${namespace}:${params.appId}:w:`;
      case KeyType.DELETE_RANGE:
          return `${namespace}:${params.appId}:d:${params.timeValue || ''}`;
      case KeyType.APP:
        return `${namespace}:a:${params.appId || ''}`;
      case KeyType.QUORUM:
        return `${namespace}:${params.appId}:q:${params.engineId || ''}`;
      case KeyType.JOB_STATE:
        return `${namespace}:${params.appId}:j:${params.jobId}`;
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
      case KeyType.SYMKEYS:
        //`symbol keys` provide the registry of replacement values for job keys
        return `${namespace}:${params.appId}:sym:keys:${params.activityId || ''}`;
      case KeyType.SYMVALS:
        //`symbol vals` provide the registry of replacement values for job vals
        return `${namespace}:${params.appId}:sym:vals:`;
      case KeyType.STREAMS:
        return `${namespace}:${params.appId || ''}:x:${params.topic || ''}`;
      default:
        throw new Error("Invalid key type.");
    }
  }
}

export { KeyService, KeyType, KeyStoreParams, PSNS };
