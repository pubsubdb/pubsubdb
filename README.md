# PubSubDB
## Overview
PubSubDB is a schema-driven solution that simplifies integration, orchestration, and actionable analytics. It allows businesses to use models that actually reflect their needs, reducing the complexity of the integration and orchestration process. PubSubDB works with any key/value store, particularly in-memory stores like *Redis*. 

With PubSubDB, you can map data between internal systems and external SaaS services using standard Open API specs, design long-running approval processes with complex conditional processing, and gather process-level insights about aggregate processes over time. 

PubSubDB's standard graph notation makes it easy to define multistep workflows and leverage existing Open API `schema` and `path` definitions when orchestrating API endpoints. The system supports full lifecycle management, providing migration and deployment tools to support hot deployments with no downtime. 

Refer to the following guide for more information on how to use PubSubDB to simplify your workflow and data mapping processes.

### Benefit | Point-to-Point Integration
Map data between internal systems and external SaaS services, using standard Open API specs to define activities. Synchronize data between systems by mapping outputs from upstream activities.

### Benefit | Workflow Orchestration
Unify the third-party tools used by lines of business (e.g, Asana, Slack) with internal systems. Design long-running approval processes with complex conditional processing.

### Benefit | Actionable Analytics
Design self-referential flows that react to events at scale. Gather process-level insights about aggregate processes over time.

## Usage Examples
PubSubDB uses standard graph notation to define the activities (nodes) and transitions (edges) between them. Consider the following sequence of 3 activities.

![Multistep Workflow](./docs/img/workflow.png)

Multistep workflows like this are defined using a standard Open API extension. This approach allows PubSubDB to leverage the existing Open API `schema` and `path` definitions when orchestrating API endpoints. For instance, the *input* and *output* schemas for the **[Create Asana Task]** activity above are already defined in the official Asana Open API specification, and the extension can reference them using a standard `$ref` tag.

### Install
Install PubSubDB using NPM.

```bash
npm install @pubsubdb/pubsubdb
```

Pass your Redis client library (e.g, `redis`, `ioredis`) to serve as the backend Data Store used by PubSubDB:

```javascript
import { PubSubDB, RedisStore } from '../index';

pubSubDB = await PubSubDB.init({ appId: 'myapp', store: new RedisStore(redisClient)});
```

### Plan
PubSubDB supports full lifecycle management like other data storage solutions. The system is designed to protect the models from arbitrary changes, providing migration and deployment tools to support hot deployments with no downtime. It's possible to plan the migration beforehand to better understand the scope of the change and whether or not a full hot deployment is possible. Provide your app manifest to PubSubDB to generate the plan.

```typescript
import { pubsubdb } from '@pubsubdb/pubsubdb';

pubsubdb.init({ });
const plan = pubsubdb.plan('./pubsubdb.yaml');
```

### Deploy
Once you're satisfied with your plan, call deploy to officially compile and deploy the next version of your application.

```typescript
import { pubsubdb } from '@pubsubdb/pubsubdb';

pubsubdb.init({ });
const status = pubsubdb.deploy('./pubsubdb.yaml');
```

### Trigger Workflow Job
Publish events to trigger any flow. In this example, the workflow is triggered by publishing the `order.approval.requested` event.

```ts
import { pubsubdb } from '@pubsubdb/pubsubdb';

const jobId = pubsubdb.pub('order.approval.requested', { id: 'order_123', price: 47.99 });
```

### Get Job Data
Get the job data for a single workflow using the job ID.

```ts
import { pubsubdb } from '@pubsubdb/pubsubdb';

const job = pubsubdb.get('order_123');
```

### Get Job Metadata
Query the status of a single workflow using the job ID. (*This query desccribes all state transitions for the job and the rate at which each activity was processed.*)

```ts
import { pubsubdb } from '@pubsubdb/pubsubdb';

const jobMetadata = pubsubdb.getJobMetadata('order_123');
```

### Get Job Statistics
Query for aggregation statistics by providing a time range and measures. In this example, the stats for the `order.approval.price.requested` topic have been requested for the past 24 hours. The granularity is set to `1h`, so an array with 24 distinct time slices will be returned.

```ts
import { pubsubdb } from '@pubsubdb/pubsubdb';

const stats = pubsubdb.getJobStatistics('order.approval.price.requested', {
  key: 'widgetA',
  granularity: '1h',
  range: '24h',
  end: 'NOW'
});
```

## Developer Guide
Refer to the [Developer Guide](./docs/developer_guide.md) for more information on the full end-to-end development process, including details about schemas and APIs.

## Model Driven Development
Refer to the [Model Driven Development](./docs/model_driven_development.md) overview document for details on how the execution model is organized.

## Data Mapping
Sharing data between activities is central to PubSubDB. Refer to the [Data Mapping Overview](./docs/data_mapping.md) for more information.

## Composition
The simplest graphs are linear, defining a predictable sequence of non cyclical activities. But graphs can be composed to model complex business scenarios and can even be designed to support long-running workflows lasting weeks or months. Refer to the [Composable Workflow Guide](./docs/composable_workflow.md) for more information.