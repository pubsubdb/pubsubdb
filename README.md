# PubSubDB
## Overview
PubSubDB is designed to simplify *integration*, *orchestration*, and *actionable analytics*.

### Point-to-Point Integration
Map data between internal systems and external SaaS services, using standard Open API specs to define activities. Synchronize data between systems by mapping outputs from upstream activities.

### Workflow Orchestration
Unify the third-party tools used by lines of business (e.g, Asana, Slack) with internal systems. Design long-running approval processes with complex conditional processing.

### Actionable Analytics
Design self-referential flows that react to events at scale. Gather process-level insights about aggregate processes over time.

## Schema-Driven Design
PubSubDB uses standard graph notation to define the activities (nodes) and transitions (edges) between them. Consider the following sequence of 3 activities.

![Multistep Workflow](./docs/img/workflow.png)

Multistep workflows like this are defined using a standard Open API extension. This approach allows PubSubDB to leverage the existing Open API `schema` and `path` definitions when orchestrating API endpoints. For instance, the *input* and *output* schemas for the **[Create Asana Task]** activity are already defined in the Asana Open API specification, and the extension can reference them using a standard `$ref` tag.

## Graph-Oriented Workflow
PubSubDB workflows are defined as a *rooted out-trees* which means that it uses graphs with a single root (trigger), from which the `activities` branch out in a tree-like structure, with no cycles. This structure allows for efficient scheduling and execution of tasks and is used in parallel and distributed computing systems.

When the graph is deployed, the PubSubDB compiler will subscribe activities to topics, ensuring workflow activities execute in sequence, while still adhering to the principles of a loosely-coupled, event-driven architecture. Design the desired process flow, using top-down semantics that make sense to business units while delivering a system based on the adaptaptive advantages of a publish/subscribe architecture.

<small>**PUBSUBDB WORKFLOW DEFINITION FILE**</small>
```yaml
activities:
  a1:
    title: Request Approval
    type: trigger
  a2:
    title: Create Asana Task
    type: openapi
    subtype: asana.1.createTask
  a3:
    title: Save Task ID
    type: return

transitions:
  a1:
    - to: a2
  a2:
    - to: a3

subscribes:
  - topic: approval.requested
    activity: a1

publishes: 
  - topic: approval.responded
    activity: a1
```

## Lifecycle Management
PubSubDB supports full lifecycle management like other data storage solutions. The system is designed to protect the models from arbitrary changes, providing migration and deployment tools to support hot deployments with no downtime. 

In the following example an updated version (2) of the `myapp` is being deployed.

```typescript
import { pubsubdb } from '@pubsubdb/pubsubdb';
pubsubdb.deploy({ target: 'app', schema: './myapp/2.yaml', store: redisClient });
```

It's possible to plan the migration beforehand to better understand the scope of the change and whether or not a full hot deployment is possible.

```typescript
import { pubsubdb } from '@pubsubdb/pubsubdb';
pubsubdb.plan({ target: 'flow', schema: './myapp/2/myflow/2.yaml', store: redisClient });
```

## Usage Examples
### Start the Engine
Engine instances are stateless and utilize a shared Redis backend. Each time an event is published, the engine will route the event to all subscribers and then sleep until the next event is published. 

```typescript
import { pubsubdb } from '@pubsubdb/pubsubdb';
pubsubdb.engine.start({ store: redisClient });
```

### Trigger a Workflow
Publish events to trigger any flow. In this example, the flow is triggered by publishing the `approval.requested` event. The payload can be an empty object but should generally contain those fields that should be persisted as the baseline 'job' data. Downstream activities may read and write to this object as it is processed, creating a consolidated view of the process.

```ts
import { pubsubdb } from '@pubsubdb/pubsubdb';
const jobId = pubsubdb.pub('approval.requested', { ... });
```

### Retrieve Job Data
Retrieve the data for a single workflow using the job ID.

```ts
import { pubsubdb } from '@pubsubdb/pubsubdb';
const job = pubsubdb.get('ord_xxx');
```

### Retrieve Job Metadata
Query the status of a single workflow using the job ID.

```ts
import { pubsubdb } from '@pubsubdb/pubsubdb';
const job = pubsubdb.getJobMetadata('ord_xxx');
```

### Get Aggregate Job Statistics
Query for aggregation statistics by providing a time range and measures. In this example, the count for the job data fields, `ndc` and `scf` have been requested for the past 24 hours. The granularity was set to `1h`, so an array with 24 distinct time slices will be returned.

>The count for any target field is distributed across cardinal values. Getting the count for a boolean field will return the total number of both `true` and `false` values.

```ts
import { pubsubdb } from '@pubsubdb/pubsubdb';
const stats = pubsubdb.getJobStatistics('approval.requested', {
  key: 'postcard',
  granularity: '1h',
  range: '24h',
  end: 'NOW',
  measures: [{ ndc: 'count' }, { scf: count }]
});
```

## Advanced Specification Details
### Schemas
The activities in a PubSubDB workflow use Open API schemas to describe *input*, *output*, *errors* and more. In the following example the fields for a *trigger* activity (**a4**) have been expanded to show the full range of configuration options.

* `settings` define the *static* configuration choices made at design time. For *triggers* this can include the specific WebHook event type that the trigger is subscribed to (like the `taskCreated` event).
* `input` defines the model for the expected incoming data payload. For triggers, this payload will serve as the baseline 'job' data that downstream activities can read and write to. For all other activity types, `input` is considered dynamic and can be mapped from an upstream activity.
* `output` is a pass-through value for triggers and is the same as the trigger's `Input`. For all other activity types, the `output` is the response produced by executing the activity.
* `errors` represent the error messages that can be returned if any activity in the flow throws an unhandled error during execution. Every error must have a standard HTTP code and message along with an optional payload. Any unhandled error will immediately halt the workflow's execution.
* `return` contains the schema for the response (if any) that is returned by the workflow. If a workflow does not contain a `return` field, it means that the system will run the workflow, but callers will not wait for a response.
* `stats` are used to define an aggregate profile when the flow is run at scale. (This example tracks *average* and *median*.)
* `stats/key` is used to group workflows based on one or more values in the event payload. For example, if the payload contains an `object_type` field (enum: *postcard*, *letter*, *check*) that is used as the `stats/key`, then data will be aggregated into three distinct sets, providing aggregation insights into each. 
* `stats/id` is the job id for a single execution of the workflow. Outside callers can get the job state by providing this ID. Each subsequent activity in the workflow can read and write to this object as defined.

<small>**EXPANDED TRIGGER ACTIVITY**</small>
```yaml
activities:
  a4:
    title: Review Order
    type: trigger
    settings:
      schema:
        $ref: './schemas.yaml#/Settings1'
      mappings:
        $ref: './x-mappings.yaml#/Settings1'
    input:
      schema:
        $ref: './schemas.yaml#/Input1'
    output:
      schema:
        $ref: './schemas.yaml#/Output1'
    return:
      schema:
        $ref: './schemas.yaml#/Return1'
    errors:
      schema:
        $ref: './schemas.yaml#/Error1'
    stats:
      key: "{activity1.input.data.object_type}"
      id: xx
      measures:
        - measure: avg
          target: {activity1.input.data.price}
        - measure: count
          target: {activity1.input.data.price}
  ...
```

>There are many activity types, each of which plays a role in supporting a composable, model-driven execution environment, including: *trigger*, *return*, *await*, *openapi*, *cron*, and *iterate*.

Schemas are stored externally to keep the worfklows readable. Here is a snapshot of the schemas referenced (`$ref`) by the `input` and `output` fields for the **Review Order** trigger above.

>This ChatGPT prompt was used to generate the schema: `Create two schemas, Input1 with required fields id (integer, int64), price (number, float, in US dollars), and object_type (string, enum: postcard, letter, check), and Output1 with required fields id (integer, int64) and task_id (integer, int64).`

```yaml
# ./schemas.yaml

Input1:
  type: object
  required:
    - id
    - price
    - object_type
  properties:
    id:
      type: integer
      format: int64
    price:
      type: number
      format: float
      description: Price of the item in US dollars.
    object_type:
      type: string
      enum:
        - postcard
        - letter
        - check

Output1:
  type: object
  required:
    - id
    - task_id
  properties:
    id:
      type: integer
      format: int64
    task_id:
      type: integer
      format: int64
      description: Created Task ID.

```

## Data Mapping
PubSubDB leverages an OpenAPI extension to define the mapping rules from one activity to another. Mapping rules are driven by the subscriber (the downstream activity). Mapping rules can apply static character data (like a fixed string or number) or can apply data produced by upstream activities. Here is an example of how the `x-pubsubdb-mappings` extension can be used to map upstream data from activities, `a1` and `a2` into activity `a3`. It also includes a couple of static values.

Refer to the [Mapping Overview](./docs/mapping.md) for more information.

```yaml
x-pubsubdb-mappings:
  id: {a1.output.data.id}
  type: employee
  "name/first": 
    "@pipe":
      - ["{a2.output.data.full_name}", " "]
      - ["{@array.split}", 0]
      - ["{@array.get}"]
```