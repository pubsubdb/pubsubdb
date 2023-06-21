import { PubSubDBGraph } from "../../types/pubsubdb";
import { CollationKey } from "../../types/collator";

class CollatorService {

  //max int digit count that supports `hincrby`
  static targetLength = 15; 

  /**
   * entry point for compiler-type activities. This is called by the compiler
   * to bind the sorted activity IDs to the trigger activity. These are then used
   * at runtime by the activities to track job/activity status.
   * @param graphs
   */
  static compile(graphs: PubSubDBGraph[]) {
    CollatorService.bindCollationKey(graphs);
  }

  /**
   * binds the `sorted` activity IDs to the trigger activity and the sort
   * order position to each activity. (This is used at runtime to track the
   * status of the job at the level of the individual activity.)
   */
  static bindCollationKey(graphs: PubSubDBGraph[]) {
    for (const graph of graphs) {
      const activities = graph.activities;
      const triggerActivityId = CollatorService.getTriggerActivityId(graph);
  
      if (triggerActivityId) {
        const activityIds = Object.keys(activities).sort();
        //bind id to trigger
        activities[triggerActivityId].collationKey = CollatorService.createKey(activityIds);

        //bind position to each activity
        Object.entries(activities).forEach(([activityId, activity]) => {
          const pos = activityIds.indexOf(activityId);
          activity.collationInt = CollatorService.getDecrement(pos);
        });
      }
    }
  }
  
  static getTriggerActivityId(graph: PubSubDBGraph): string | null {
    const activities = graph.activities;
    for (const [activityKey, activity] of Object.entries(activities)) {
      if (activity.type === "trigger") {
        return activityKey;
      }
    }
    return null;
  }

  /**
   * alphabetically sort the activities by their ID (ascending) ["a1", "a2", "a3", ...]
   * and then bind the sorted array to the trigger activity. This is used by the trigger
   * at runtime to create 15-digit collation integer (99999999999) that can be used to track
   * the status of the job at the level of the individual activity. A collation value of
   * 899000000000000 means that the first activity (assume 'a1') is running and the others
   * are still pending. NOTE: sorting is alphabetical, so it is merely coincidence that
   * the value was `899*` and not `989*` or `998*`.
   * @param {string[]} sortedActivityIds - an array of activity IDs sorted alphabetically
   * @returns {number} A number that represents the collation key for the job.
   */
  static createKey(sortedActivityIds: string[]): number {
    const length = sortedActivityIds.length;
    const val = Math.pow(10, length) - 1; //e.g, 999, 99999, 9999999, etc
    const paddedNumber = val + '0'.repeat(CollatorService.targetLength - length);
    return parseInt(paddedNumber, 10);
  }

  /**
   * helps update the collation key for the job by subtracting the activity's position from
   * the 15-digit collation key. For example, if the collation key is 999999999999900
   * and the activity is the 3rd in the list (and the multipler is 1),
   * then the collation key will be updated to 998999999999900.
   * This means that the activity is running. When an activity completes, 2 will be subtracted.
   * @param {number} position - between 0 and 14 inclusive
   * @param {number} multiplier
   * @returns {number}
   */
  static getDecrement(position: number, multiplier: 1|2|3|4|5|6|7|8|9 = 1): number {
    if (position < 0 || position > 14) {
      throw new Error('Invalid position. Must be between 0 and 14, inclusive.');
    }
    const targetLength = 15;
    return Math.pow(10, targetLength - position - 1) * multiplier;
  }

  static isJobComplete(collationKey: number|string): boolean {
    return CollatorService.isThereAnError(collationKey) ||
      !CollatorService.isThereAnIncompleteActivity(collationKey);
  }

  static isThereAnError(collationKey: number|string): boolean {
    return collationKey.toString().includes(CollationKey.Errored.toString());
  }

  static isThereAnIncompleteActivity(collationKey: number|string): boolean {
    const str = collationKey.toString();
    return str.includes(CollationKey.Pending.toString()) ||
      str.includes(CollationKey.Started.toString()) || 
      str.includes(CollationKey.Paused.toString());
  }
}

export { CollatorService };
