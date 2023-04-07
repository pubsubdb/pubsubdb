// NamespaceService.ts
import { PubSubDBManifest } from "../../typedefs/pubsubdb";

const PUBSUBDB_NAMESPACE = "ps";
const NAMESPACES = {
  PUBSUBDB: `db`,                    //pubsubdb manifest (in Redis: `psdb:`)
  JOB_DATA: `job`,                   //job data
  JOB_METADATA: `jobmd`,             //job metadata
  JOB_STATISTICS: `jobstats`,        //job statistics (aggregated job data)
  ACTIVITY_DATA: `activity`,         //raw activity data
  ACTIVITY_METADATA: `activitymd`,   //activity metadata
  ACTIVITY_SCHEMAS: `schemas`,       //schemas (always indexed by topic)
  SUBSCRIPTION_PATTERNS: `patterns`, //pspatterns:order.created: cached locally for faster lookup
  SUBSCRIPTIONS: `subscriptions`,    //called using subscription ids resolved by applying `patterns` to published data
};


class NamespaceService {

  public static getKeyPrefix(manifest: PubSubDBManifest, type: keyof typeof NAMESPACES, includeVersion = true): string {
    const basePrefix = `${PUBSUBDB_NAMESPACE}:${manifest.app.id}`;
    if (includeVersion) {
      return `${basePrefix}:${manifest.app.version}:`;
    }
    return `${basePrefix}:`;
  }

  public static getNamespaces(): typeof NAMESPACES {
    return NAMESPACES;
  }
}


export { NAMESPACES, PUBSUBDB_NAMESPACE, NamespaceService };

/**
 * METADATA and SYS CONFIG stored in redis will include the app
 * name+version prefix. This allows updates to config and metadata,
 * using the version to safely isolate new rules from old rules.
 *
 * KEY PREFIX:
 * `ps:<app.id>:<app.version>:`
 * `ps:jimbo:1:`
 * 
 * SCHEMAS:
 * `ps:<app.id>:<app.version>:schemas`
 * `ps:jimbo:1:schemas`
 * 
 * DATA will include just the app name prefix. DATA spans versions and needs to be
 * available for all versions of the app.
 * 
 * JOB_DATA ():
 * `ps:<app.id>:job:<job.id>`
 * `ps:jimbo:job:1234`
 * 
 * ACTIVITY_DATA ():
 * `ps:<app.id>:activity:<job.id>`
 * `ps:jimbo:activity:1234`
 */
