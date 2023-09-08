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

  static isJobComplete(status: number, state = 'active'): boolean {
    return state !== 'active' || (status - 0) <= 0
  }

  static isActivityComplete(status: number): boolean {
    return (status - 0) <= 0;
  }
}

export { CollatorService };
