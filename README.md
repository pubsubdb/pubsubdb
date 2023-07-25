# PubSubDB
![alpha release](https://img.shields.io/badge/release-alpha-yellow)

## Overview
PubSubDB is a *Process Database* that manages changes to data over time. With PubSubDB, you describe activity flow using YAML models. PubSubDB then orchestrates the execution of those activities, coordinating data flow as it moves through the network. Backed by a [headless orchestration engine](./docs/architecture.md), PubSubDB delivers sophisticated event orchestration at scale using standard infrastructure you already own.

## Install
[![npm version](https://badge.fury.io/js/%40pubsubdb%2Fpubsubdb.svg)](https://badge.fury.io/js/%40pubsubdb%2Fpubsubdb)

```sh
npm install @pubsubdb/pubsubdb
```

## Initialize
Pass a Redis client (`redis` or `ioredis`) when initializing PubSubDB.

```ts
import {
  PubSubDB,
  RedisStore,
  RedisStream,
  RedisSub } from '@pubsubdb/pubsubdb';

//init 3 Redis clients using `ioredis` or `redis` NPM packages
const storeClient = await getRedisClient(...)
const streamClient = await getRedisClient(...)
const subClient = await getRedisClient(...)

//init/start PubSubDB
const pubSubDB = await PubSubDB.init({
  appId: 'myapp',
  engine: {
    store: new RedisStore(storeClient),
    stream: new RedisStream(streamClient),
    sub: new RedisSub(subClient),
  }
});
```

## Design
PubSubDB models serve as *execution instructions*, describing activity and data flow. Consider the following flow that checks for a customer discount.

```yaml
subscribes: discount.requested
publishes: discount.responded

input:
  schema:
    $ref: '.discount.requested.yaml#/get_discount/input'
output:
  schema:
    $ref: './discount.requested.yaml#/get_discount/output'

activities:
  get_discount:
    title: Get Price Discount
    type: trigger
    stats:
      id: "{$self.input.data.id}"

  get_available:
    title: Check Available Discounts
    type: worker
    subtype: discounts.enumerate
    ...

transitions:
  get_discount:
    get_available:
      conditions:
        ...
```

Note the following:

1. **Subscribe and Publish**: Each YAML file represents a flow of activities, subscribing to and publishing events. In this example, the flow subscribes to `discount.requested` and publishes to `discount.responded`.

2. **Input\/Output Schemas**: Flows may define top-level schemas, while each activity in a flow may likewise define its own unique schemas.

3. **Activities**: Activities are the building blocks of the flow. Each activity (like `get_discount`) represents a single step in the process. Flows are composable and can be connected using an `await` activity. The `worker` activity in this example will invoke a function, bridging the activity flow defined in the model with legacy IP/functions on your network.

4. **Data Mapping**: The mapping syntax, referred to as [@pipes](./docs/data_mapping.md), standardizes how data is mapped and shared between activities.

5. **Conditional Transitions**: Design flows with sophisticated `and`/`or` conditions that branch based upon the state of the data.

## Orchestrate
Once the YAML is deployed and activated, call PubSubDB to trigger workflows and track their progress using familiar pub/sub semantics.

* *pub* for one-way (fire-and-forget) workflows
* *sub* for global subscriptions for all workflow output
* *pubsub* for replacing brittle HTTP calls [![video](https://cdn.loom.com/sessions/thumbnails/e02593806783449f9ff84e222bdb8289-with-play.gif)](https://www.loom.com/share/e02593806783449f9ff84e222bdb8289)

### Pub
Kick off a one-way workflow and await the response (the job ID) to confirm that the request was received.

```javascript
const topic = 'discount.requested';
const payload = { id: 'ord123', price: 55.99 };
const jobId = await pubSubDB.pub(topic, payload);
//jobId => `ord123`
```

Call `getState` to fetch the job `data`, `metadata`, and `status`.

```javascript
const job = await pubSubDB.getState(topic, jobId);
//job => { data: { id: 'ord123', price: 55.99 }, metadata: { ... }}
```   

### Sub
Call `sub` to listen in on the results of all running flows for a particular topic. This is useful when monitoring global computation results, performing some action based on them, or even just logging for auditing purposes.

```javascript
await pubSubDB.sub('discount.responded', (topic: string, jobOutput: JobOutput) => {
  //jobOutput.data.discount is `5.00`
});

//publish one test event
const payload = { id: 'ord123', price: 55.99 };
const jobId = await pubSubDB.pub('discount.requested', payload);
```

### PubSub
Replace brittle inter-service HTTP calls with calls to `pubsub`. PubSubDB will create a one-time subscription, brokering the data exchange between services without back-pressure risk.

```javascript
const topic = 'discount.requested';
const payload = { id: 'ord123', price: 55.99 };
const jobOutput: JobOutput = await pubSubDB.pubsub(topic, payload);
//jobOutput.data.discount is `5.00`
```

No matter where in the network the calculation is performed (no matter the microservice that is subscribed as the official *worker* to perform the calculation...or even if multiple microservices are invoked during the workflow execution), the answer will always be published back to the originating caller the moment it's ready.

## Workers
Associate worker functions with a *topic* of your choosing. When PubSubDB runs a `worker` activity in your YAML descriptor that matches this *topic*, it will invoke your function. In this example, the handler is registered to respond to the `discounts.enumerate` topic.

```javascript
import {
  PubSubDB,
  PubSubDBConfig,
  RedisStore
  RedisStream
  RedisSub } from '@pubsubdb/pubsubdb';

//init 3 standard Redis clients
const redisClient1 = getMyRedisClient();
const redisClient2 = getMyRedisClient();
const redisClient3 = getMyRedisClient();

const pubSubDB = await PubSubDB.init({
  appId: "myapp",
  workers: [
    { 
      store: new RedisStore(redisClient1),
      stream: new RedisStream(redisClient2),
      sub: new RedisSub(redisClient3),

      //the topic to listen for
      topic: 'discounts.enumerate',

      //the handler function to invoke
      callback: async (data: StreamData) => {
        return {
          status: 'success',
          metadata: { ...data.metadata },
          data: { discounts }
        };
      }
    }
  ]
};
```

## FAQ
Refer to the [FAQ](./docs/faq.md) for terms, definitions, and an overview of how a Process Database simplifies worflow type use cases.

## Developer Guide
Refer to the [Developer Guide](./docs/developer_guide.md) for more information on the full end-to-end development process, including details about schemas, APIs, and deployment.

## Model Driven Development
[Model Driven Development](./docs/model_driven_development.md) is a proven approach to managing process-oriented tasks. Refer this guide for an overview of key principles.

## Data Mapping
Sharing data between activities is central to PubSubDB. Refer to the [Data Mapping Overview](./docs/data_mapping.md) for more information about supported functions and syntax.

## Composition
The simplest graphs are linear, defining a predictable sequence of non cyclical activities. But graphs can be composed to model complex business scenarios and can even be designed to support long-running workflows lasting for months. Refer to the [Composable Workflow Guide](./docs/composable_workflow.md) for more information.

## Architectural First Principles
Refer to the [Architectural First Principles Overview](./docs/architecture.md) for details on PubSubDB's approach to headless network orchestration.

## Headless Orchestration
PubSubDB is a headless orchestration engine. Refer to the [Headless Orchestration Guide](./docs/headless_orchestration.md) for more information on the approach.

## System Lifecycle
Gain insight into the PubSubDB's monitoring, exception handling, and alarm configurations via the [System Lifecycle Guide](./docs/system_lifecycle.md).

## My First App
Design a [Network Calculator App](./docs/my_first_app.md) to learn the principles behind statefully orchestrating multi-service workflows.
