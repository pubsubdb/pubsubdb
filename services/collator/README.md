# Collation Service

The Collation Service tracks the state of all activities in a running graph (i.e., "Job"). By generating a unique 15-digit collation key, the Collation Service can track Job state with a single call to `hincrby` each time an activity's state changes (started, completed, etc).

## Table of Contents

1. [Overview](#overview)
4. [Collation Key and Activity Statuses](#collation-key-and-activity-statuses)
5. [Examples](#examples)

## Overview

The Collation Service aims to solve the problem of efficiently tracking the state of connected activities in a graph, especially when determining when a job is 'done' in a stateless environment.

## Collation Key and Activity Statuses

Each digit in the collation key represents the status of an activity:

- 9: Pending
- 8: Started
- 7: Errored
- 6: Completed
- 5: Paused
- 4: Released
- 3: Skipped
- 2: Unreachable
- 1: ???? Place Holder ????

## Examples
 Consider a flow with this activity sequence:
 
 `quick => brown => fox => (jumped|(slept => ate))`
 
 The sorted ids would be:
 
 `["ate", "brown", "fox", "jumped", "quick", "slept"]`
 
 Even though the trigger (quick) is **first** in the graph, it is alphabetically  **fifth**. This means that once the trigger completes, the value of the collation key will be `999969000000000`.

### Example 1: 968969000000000

The `quick` and `brown` activities have *completed* and `fox` is currently *started*.

| Activity | State   | Numeric Value |
| -------- | ------- | ------------- |
| quick    | Completed | 6           |
| brown    | Completed | 6           |
| fox      | Started   | 8           |
| jumped   | Pending   | 9           |
| slept    | Pending   | 9           |
| ate      | Pending   | 9           |

### Example 2: 266863000000000
The `quick`, `brown`, and `fox` activities have *completed* and `jumped` is currently *started*. The `slept` activity was *skipped* and its child activity, `ate` is *unreachable*.

| Activity | State   | Numeric Value |
| -------- | ------- | ------------- |
| quick    | Completed | 6           |
| brown    | Completed | 6           |
| fox      | Completed | 6           |
| jumped   | Started   | 8           |
| slept    | Skipped   | 3           |
| ate      | Unreachable | 2         |

### Example 3: 266663000000000
The `quick`, `brown`, `fox`, and `jumped` activities have *completed*. The `slept` activity was *skipped* and its child activity, `ate` is *unreachable*.

>NOTE: This flow is considered 'complete' as no activities are active (6, 2, 3). At execution time, one can assume that the `jumped` activity likely decremented its value by '2' units upon completion of the activity, resulting in a final integer of `266663000000000`. The engine would know based upon this value that no other activity is possibly active or otherwise pending and would complete the job.

| Activity | State   | Numeric Value |
| -------- | ------- | ------------- |
| quick    | Completed     | 6           |
| brown    | Completed     | 6           |
| fox      | Completed     | 6           |
| jumped   | Completed       | 6           |
| slept    | Skipped       | 3           |
| ate      | Unreachable   | 2           |

### Example 5: 566366000000000
The `quick`, `brown`, `fox`, and `slept` activities have *completed*. The `jumped` activity was *skipped*. The `ate` activity has already completed and is now in a *paused* state, awaiting release.

| Activity | State     | Numeric Value |
| -------- | --------- | ------------- |
| quick    | Completed | 6           |
| brown    | Completed | 6           |
| fox      | Completed | 6           |
| jumped   | Skipped   | 3           |
| slept    | Completed | 6           |
| ate      | Paused    | 5           |

### Example 6: 466366000000000
The `quick`, `brown`, `fox`, and `slept` activities have *completed*. The `jumped` activity was *skipped*. The `ate` activity was paused and has now been *released* (4).

>NOTE: This flow is considered 'complete' as no activities are active (6, 4, 3). At execution time, one can assume that the `ate` activity would have decremented its value by '1' unit upon resumption of the paused activity state (5 => 4), resulting in a final integer of `466366000000000`. The engine would know based upon this value that no other activity is possibly active and would complete the job.

| Activity | State     | Numeric Value |
| -------- | --------- | ------------- |
| quick    | Completed | 6           |
| brown    | Completed | 6           |
| fox      | Completed | 6           |
| jumped   | Skipped   | 3           |
| slept    | Completed | 6           |
| ate      | Released  | 4           |

### ERROR Example: 766366000000000
The `ate` activity returned an *error* and the `jumped` activity was *skipped*. All other activities *completed* normally.

>NOTE: This flow is considered 'complete' as no activities are active (7, 6, 3). At execution time, one can assume that the `ate` activity would decrement its value by '1' unit after an unsuccessful execution (8 => 7), resulting in a final integer of `766366000000000`. The engine would know based upon this value that no other activity is possibly active and would complete the job in an error state.

| Activity | State     | Numeric Value |
| -------- | --------- | ------------- |
| quick    | Completed | 6           |
| brown    | Completed | 6           |
| fox      | Completed | 6           |
| jumped   | Skipped   | 3           |
| slept    | Completed | 6           |
| *ate*      | *Errored*   | *7*           |