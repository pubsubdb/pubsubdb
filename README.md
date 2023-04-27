# PubSubDB
## Overview
PubSubDB is a model-driven solution that simplifies integration, orchestration, and actionable analytics. Design your key business workflows using standard graph notation, while PubSubDB handles the implementation. PubSubDB is designed to work with any key/value store, with a reference implementation using *Redis*. Refer to the following guide for more information on how to use PubSubDB to simplify your workflow needs.

### Benefit | Point-to-Point Integration
Map data between internal systems and external SaaS services, using standard Open API specs to define activities. Synchronize data between systems by mapping outputs from upstream activities.

### Benefit | Workflow Orchestration
Unify the third-party tools used by lines of business (e.g, Asana, Slack) with internal systems. Design long-running approval processes with complex conditional processing.

### Benefit | Actionable Analytics
Design self-referential flows that react to events at scale. Gather process-level insights about aggregate processes over time.

## Usage Examples
PubSubDB uses standard graph notation to define the activities (nodes) and transitions (edges) between them. Consider the following sequence of 3 activities.

![Multistep Workflow](./docs/img/workflow.png)

Multistep workflows like this are defined using a standard Open API extension. This approach allows PubSubDB to leverage the existing Open API definitions when orchestrating API endpoints. For example, the *input* and *output* schemas for the **[Create Asana Task]** activity above are already defined in the official Asana Open API specification, and the extension can reference them using a standard `$ref` tag.

### Install
[![npm version](https://badge.fury.io/js/%40pubsubdb%2Fpubsubdb.svg)](https://badge.fury.io/js/%40pubsubdb%2Fpubsubdb)

Install PubSubDB using NPM. 

```sh
npm install @pubsubdb/pubsubdb
```

Pass your Redis client library (The `redis` and `ioredis` NPM packages are supported) to serve as the backend Data Store used by PubSubDB:

```javascript
import { PubSubDB, IORedisStore, RedisStore } from '@pubsubdb/pubsubdb';

//initialize two standard Redis client instances using `ioredis` or `redis`
//const redisClient = await getMyRedisClient...
//const redisSubscriberClient = await getMyReadOnlyRedisClient...

//wrap your redisClient instances (this example uses `ioredis`)
const store = new IORedisStore(redisClient, redisSubscriberClient)

//initialize PubSubDB
pubSubDB = await PubSubDB.init({ appId: 'myapp', store});
```

### Plan
It's possible to plan the migration beforehand to better understand the scope of the change and whether or not a hot deployment is possible. Provide your app manifest to PubSubDB to generate the plan.

```typescript
import { PubSubDB, IORedisStore, RedisStore } from '@pubsubdb/pubsubdb';

const pubSubDB = PubSubDB.init({ ... });
const plan = pubSubDB.plan('./pubsubdb.yaml');
```

### Deploy
Once you're satisfied with your plan, call `deploy` to officially compile and deploy your flows. The compiler will save a static copy of the deployment manifest to your local file system and then transfer the execution instructions to Redis.

>NOTE: It's good practice to execute this call in your local Git branch to generate the versioned source files for persistence to your VCS. It helps others reason about the version history for the application and the manner in which it changed over time.

```typescript
import { PubSubDB, IORedisStore, RedisStore } from '@pubsubdb/pubsubdb';

const pubSubDB = PubSubDB.init({ ... });
const status = await pubSubDB.deploy('./pubsubdb.yaml');
```

### Activate
Call `activate` to set which deployment version to use. The update will be applied system-wide to all running clients.

```typescript
import { PubSubDB, IORedisStore, RedisStore } from '@pubsubdb/pubsubdb';

const pubSubDB = PubSubDB.init({ ... });
await pubSubDB.activate('2');
```

### Trigger Workflow Job
Publish events to trigger any flow. In this example, the workflow is triggered by publishing the `order.approval.requested` event.

```ts
import { PubSubDB, IORedisStore, RedisStore } from '@pubsubdb/pubsubdb';

const pubSubDB = PubSubDB.init({ ... });

const payload = {
  id: 'order_123',
  price: 47.99,
  object_type: 'widgetA'
};
const jobId = pubSubDB.pub('order.approval.requested', payload);
```

### Get Job Data
Get the job data for a single workflow using the job ID.

```ts
import { PubSubDB, IORedisStore, RedisStore } from '@pubsubdb/pubsubdb';

const pubSubDB = PubSubDB.init({ ... });
const job = pubSubDB.get('order_123');
```

### Get Job Metadata
Query the status of a single workflow using the job ID. (*This query desccribes all state transitions for the job and the rate at which each activity was processed.*)

```ts
import { PubSubDB, IORedisStore, RedisStore } from '@pubsubdb/pubsubdb';

const pubSubDB = PubSubDB.init({ ... });
const jobMetadata = pubSubDB.getJobMetadata('order_123');
```

### Get Job Statistics
Query for aggregation statistics by providing a time range and the data you're interested in. In this example, the stats for the `order.approval.requested` topic have been requested for the past 24 hours (`24h`). The `data` field is used to target the desired records and will limit the statistics to just those records with the provided characteristics.

```ts
import { PubSubDB, IORedisStore, RedisStore } from '@pubsubdb/pubsubdb';

const pubSubDB = PubSubDB.init({ ... });

const payload = {
  data: {
    object_type: 'widgetA'
  },
  range: '24h',
  end: 'NOW'
};
const stats = pubSubDB.getStats('order.approval.requested', payload);
```

### Get Job Ids
All workflow jobs are persisted as time-series data, enabling you to track specific jobs according to their payload. In this example, the stats for the `order.approval.requested` topic have been requested for the past 30 minutes (`30m`). The `data` field is used to specify the *shape* of the data, limiting ids to those jobs where the `object_type` is *widgetA*.
```ts
import { PubSubDB, IORedisStore, RedisStore } from '@pubsubdb/pubsubdb';

const pubSubDB = PubSubDB.init({ ... });

const payload = {
  data: {
    object_type: 'widgetA'
  },
  range: '30m',
  end: 'NOW'
};
const ids = pubSubDB.getIds('order.approval.requested', payload);
```

## Developer Guide
Refer to the [Developer Guide](./docs/developer_guide.md) for more information on the full end-to-end development process, including details about schemas and APIs.

## Intro to Model Driven Development
[Model Driven Development](./docs/model_driven_development.md) is a proven approach to managing process-oriented tasks. Refer this guide for an overview of key features.

## Data Mapping
Sharing data between activities is central to PubSubDB. Refer to the [Data Mapping Overview](./docs/data_mapping.md) for more information.

## Composition
The simplest graphs are linear, defining a predictable sequence of non cyclical activities. But graphs can be composed to model complex business scenarios and can even be designed to support long-running workflows lasting weeks or months. Refer to the [Composable Workflow Guide](./docs/composable_workflow.md) for more information.