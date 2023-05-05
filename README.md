# PubSubDB
## Overview
PubSubDB is a unified *integration*, *orchestration*, and *operational data* platform. Design your key business workflows using standard graph notation, while PubSubDB handles the implementation. PubSubDB is designed to work with any backend data store, with a reference implementation using *Redis*. Refer to this guide for more information on how to get started with PubSubDB.

## Benefits
PubSubDB is distinguished by is its elegant twist on state management. The magic happens at compilation when the rules of the system are compiled down to pure events. The end result is a high-performance, low-latency workflow engine that can model any complex business process at a fraction of the cost.

### Operationalized Data
Expose a real-time operational data layer with microsecond latency. The correlation engine will manage the entire cascade of business events, implicitly orchestrating the event stream through its conclusion.

### Point-to-Point Integration
Map data between internal systems and external SaaS services, using standard Open API specs to define activities. Synchronize data between systems by mapping outputs from upstream activities.

### Workflow Orchestration
Unify the third-party tools used by lines of business (e.g, Asana, Slack) with internal systems. Design long-running approval processes with complex conditional processing.

### Actionable Analytics
Design self-referential flows that react to events at scale. Gather process-level insights about aggregate processes over time.

## System Design
PubSubDB uses standard graph notation to define the activities (nodes) and transitions (edges) between them. Consider the following sequence of 3 activities.

![Multistep Workflow](./docs/img/workflow.png)

Multistep workflows like this are defined using YAML and adhere to the Open API 3.0 specfication. This approach allows PubSubDB to leverage standard Open API specs when orchestrating API endpoints. For example, the *input* and *output* schemas for the **[Create Asana Task]** activity above are already defined in the official Asana Open API specification, and the extension can reference them using a standard `$ref` tag.

## Install
[![npm version](https://badge.fury.io/js/%40pubsubdb%2Fpubsubdb.svg)](https://badge.fury.io/js/%40pubsubdb%2Fpubsubdb)

```sh
npm install @pubsubdb/pubsubdb
```

## Initialize
Pass your Redis client library (`redis` and `ioredis` are supported) to serve as the backend Data Store used by PubSubDB:

```ts
import { PubSubDB, IORedisStore, RedisStore } from '@pubsubdb/pubsubdb';

//initialize two standard Redis client instances using `ioredis` or `redis`
const redisClient = await getMyRedisClient(...)
const redisSubscriberClient = await getMyReadOnlyRedisClient(...)

//wrap your redisClient instances (this example uses `ioredis`)
const store = new IORedisStore(redisClient, redisSubscriberClient)

//initialize PubSubDB
pubSubDB = await PubSubDB.init({ appId: 'myapp', store});
```

## Design
PubSub DB application graphs are modeled using YAML. These can be considered the execution instructions for the app, describing its activity and data flow. For introductory purposes, let's consider the simplest flow possible: *a one-step process*. 

A process with only one step can seem relatively unremarkable, but it serves to reveal the type of information that is tracked by the system and how to take advantage of it. Once deployed, this flow will listen to the `item.ordered` event and track key statistics about the order size.

```yaml
app:
  id: my-app
  version: 1
  graphs:
  - subscribes: item.ordered
    publishes: item.shipped
    activities:
      order:
        title: Item Ordered
        type: trigger
        job:
          schema:
            type: object
            properties:
              email:
                type: string
              size:
                type: string
                description: The item size
                enum:
                - sm
                - md
                - lg
          maps:
            id: "{$self.input.data.email}"
            size: "{$self.input.data.size}"
        stats:
          granularity: 5m
          id: "{$self.input.data.email}"
          key: orders
          measures:
          - measure: count
            target: "{$self.input.data.size}"
          - measure: index
            target: "{$self.input.data.size}"
```

Once deployed, this process will listen to the `item.ordered` event and will persist information as described by the YAML. Let's start by inserting some data which is handled through simple pub/sub semantics.

```ts
const order = pubSubDB.pub('item.ordered', { "email": "jdoe@email.com", "size": "lg" });
```

Now let's ask some questions about the `item.ordered` workflow.

### Question 1
*What is the order for the user, `jdoe@email.com`?*
```ts
const order = await pubSubDB.get('jdoe@email.com');
```

*Answer*
```ts
{ "id": "jdoe@email.com", "size": "lg" }
```

### Question 2
*How many large (`lg`) items were ordered in the past hour?*
```ts
const payload = { data: { size: 'lg' }, range: '1h', end: 'NOW' };
const stats = pubSubDB.getStats('item.ordered', payload);
```

*Answer*
```json
{
  "key": "orders",
  "granularity": "5m",
  "range": "1h",
  "end": "NOW",
  "measures": [
    {
      "target": "size:lg",
      "type": "count",
      "value": 70
    },
    {
      "target": "size:md",
      "type": "count",
      "value": 102
    },
    {
      "target": "size:lg",
      "type": "count",
      "value": 40
    }
  ],
  "segments": [
    {
      "time": "2023-04-04T00:00:00Z",
      "measures": [
        {
          "target": "size:lg",
          "type": "count",
          "value": 31
        }
        ...
      ]
    }
    ...
  ]
}
```

## Deploy
Once you're satisfied with your application model, call `deploy` to compile and deploy your flows. The compiler will save a static copy of the deployment manifest to your local file system and then transfer the execution instructions to your backend datastore, distributing the version simultaneously to all connected clients.

```typescript
const pubSubDB = PubSubDB.init({ ... });
const status = await pubSubDB.deploy('./pubsubdb.yaml');
```

## Architectural First Principles
Refer to the [Architecture Overview](./docs/architecture.md) for an overview of why PubSubDB outperforms existing operational data platforms.

## Developer Guide
Refer to the [Developer Guide](./docs/developer_guide.md) for more information on the full end-to-end development process, including details about schemas and APIs.

## Intro to Model Driven Development
[Model Driven Development](./docs/model_driven_development.md) is a proven approach to managing process-oriented tasks. Refer this guide for an overview of key features.

## Data Mapping
Sharing data between activities is central to PubSubDB. Refer to the [Data Mapping Overview](./docs/data_mapping.md) for more information.

## Composition
The simplest graphs are linear, defining a predictable sequence of non cyclical activities. But graphs can be composed to model complex business scenarios and can even be designed to support long-running workflows lasting weeks or months. Refer to the [Composable Workflow Guide](./docs/composable_workflow.md) for more information.