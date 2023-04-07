# PubSubDB
## Overview
PubSubDB is designed to simplify *integration*, *orchestration*, and *actionable analytics*. It is designed to work with any key/value store (particularly in-memory stores like Redis).

### Point-to-Point Integration
Map data between internal systems and external SaaS services, using standard Open API specs to define activities. Synchronize data between systems by mapping outputs from upstream activities.

### Workflow Orchestration
Unify the third-party tools used by lines of business (e.g, Asana, Slack) with internal systems. Design long-running approval processes with complex conditional processing.

### Actionable Analytics
Design self-referential flows that react to events at scale. Gather process-level insights about aggregate processes over time.

## Schema-Driven Design
PubSubDB uses standard graph notation to define the activities (nodes) and transitions (edges) between them. Consider the following sequence of 3 activities.

![Multistep Workflow](./docs/img/workflow.png)

Multistep workflows like this are defined using a standard Open API extension. This approach allows PubSubDB to leverage the existing Open API `schema` and `path` definitions when orchestrating API endpoints. For instance, the *input* and *output* schemas for the **[Create Asana Task]** activity above are already defined in the official Asana Open API specification, and the extension can reference them using a standard `$ref` tag.

## Usage Examples

### Install
Install PubSubDB using NPM.

```bash
npm install @pubsubdb/pubsubdb
```

Pass your Redis client library (e.g, `redis`, `ioredis`) to serve as the backend Data Store used by PubSubDB:

```javascript
import { PubSubDB, RedisStore } from '../index';
//provide your Redis client instance to initialize
pubSubDB = await PubSubDB.init({ store: new RedisStore(redisClient)});
```

### Plan
PubSubDB supports full lifecycle management like other data storage solutions. The system is designed to protect the models from arbitrary changes, providing migration and deployment tools to support hot deployments with no downtime. It's possible to plan the migration beforehand to better understand the scope of the change and whether or not a full hot deployment is possible. Provide your app manifest to PubSubDB to generate the plan.

```typescript
import { pubsubdb } from '@pubsubdb/pubsubdb';
pubsubdb.init({ /* config */});
const plan = pubsubdb.plan('./pubsubdb.yaml');
//returns graph, models, compilation errors, etc
```

### Deploy
Once you're satisfied with your plan, call deploy to officially compile and deploy the next version of your application.

```typescript
import { pubsubdb } from '@pubsubdb/pubsubdb';
pubsubdb.init({ /* config */});
const plan = pubsubdb.deploy('./pubsubdb.yaml');
//returns CHANGED graph, models, etc
```

### Trigger Workflow Job
Publish events to trigger any flow. In this example, the workflow is triggered by publishing the `order.approval.requested` event.

```ts
import { pubsubdb } from '@pubsubdb/pubsubdb';
const jobId = pubsubdb.pub('myapp', 'order.approval.requested', { id: 'order_123', price: 47.99 });
```

### Get Job Data
Get the job data for a single workflow using the job ID.

```ts
import { pubsubdb } from '@pubsubdb/pubsubdb';
const job = pubsubdb.get('myapp', 'order_123');
```

### Get Job Metadata
Get the job metadata for a single workflow using the job ID.

```ts
import { pubsubdb } from '@pubsubdb/pubsubdb';
const job = pubsubdb.getJobMetadata('myapp', 'order_123');
```

### Get Job Statistics
Query for aggregation statistics by providing a time range and measures. In this example, the stats for the `order.approval.price.requested` topic have been requested for the past 24 hours. The granularity is set to `1h`, so an array with 24 distinct time slices will be returned.

```ts
import { pubsubdb } from '@pubsubdb/pubsubdb';
const stats = pubsubdb.getJobStatistics('myapp', 'order.approval.price.requested', {
  key: 'widgetX',
  granularity: '1h',
  range: '24h',
  end: 'NOW'
});
```

## Developer Guide
Refer to the [Developer Guide](./docs/developer_guide.md) for more information on the full end-to-end development process, including details about schemas and APIs.

## Advanced Data Mapping
Sharing data between activities is central to PubSubDB. Refer to the [Data Mapping Overview](./docs/data_mapping.md) for more information.

## Advanced Workflow Composition
The simplest graphs are linear, defining a predictable sequence of non cyclical activities. But graphs can be composed to model complex business scenarios and can even be designed to support long-running workflows lasting weeks or months. Refer to the [Composable Workflow Guide](./docs/composable_workflow.md) for more information.