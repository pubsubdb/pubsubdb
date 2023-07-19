# PubSubDB: A Process Database
![alpha release](https://img.shields.io/badge/release-alpha-yellow)


## Overview
PubSubDB embraces the fluid nature of data, offering a native way to model changes to data as it flows from activity to activity. With PubSubDB, you're not just storing data; you're managing process. Define schemas and rules that naturally map to your business logic, while PubSubDB handles the implementation.

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
PubSubDB flows are modeled using YAML. These are the *execution instructions*, describing the activity and data flow. Consider the following flow that checks for a customer discount.

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

2. **Input\/Output Schemas**: Flows may define top-level inputs and outputs, while each activity in a flow may likewise define its own unique inputs and outputs.

3. **Activities**: Activities are the building blocks of the flow. Each activity (like `get_discount`) represents a single step in the process. Flows are composable and can be connected using an `await` activity.

4. **Data Mapping**: The mapping syntax, referred to as [@pipes](./docs/data_mapping.md), standardizes how data is mapped and shared between activities.

5. **Conditional Transitions**: Design flows with sophisticated `and`/`or` conditions that branch based upon the state of the data.

## Orchestrate
Once the YAML is deployed and activated, trigger workflows and track their progress using familiar pub/sub semantics.

* *pub* for one-way (fire-and-forget) workflows
* *sub* for global subscriptions for all workflow output
* *pubsub* for replacing brittle HTTP calls [![video](https://cdn.loom.com/sessions/thumbnails/e02593806783449f9ff84e222bdb8289-with-play.gif)](https://www.loom.com/share/e02593806783449f9ff84e222bdb8289)

### Pub
Kick off a one-way workflow if the answer isn't relevant at this time. Optionally await the response (the job ID) to confirm that the request was received, but otherwise, this is a fire-and-forget call that will always complete in milliseconds.

```javascript
const topic = 'discount.requested';
const payload = { id: 'ord123', price: 55.99 };
const jobId = await pubSubDB.pub(topic, payload);
//jobId => `ord123`
```

Fetch the job `data`, `metadata`, and `status` at a later time by calling `getState`.

```javascript
const job = await pubSubDB.getState(topic, jobId);
//job => { data: { id: 'ord123', price: 55.99 }, metadata: { ... }}
```   

### Sub
Use the `sub` method to listen in on the results of all computations on a particular topic. This is useful when monitoring global computation results, performing some action based on them, or even just logging them for auditing purposes.

```javascript
await pubSubDB.sub('discount.responded', (topic: string, jobOutput: JobOutput) => {
  //jobOutput.data.discount is `5.00`
});

//publish one test event
const payload = { id: 'ord123', price: 55.99 };
const jobId = await pubSubDB.pub('discount.requested', payload);
```

### PubSub
For traditional request/response use cases where one service calls another, use the `pubsub` method. PubSubDB will create a one-time subscription, brokering the exchange using a standard `await`.

```javascript
const topic = 'discount.requested';
const payload = { id: 'ord123', price: 55.99 };
const jobOutput: JobOutput = await pubSubDB.pubsub(topic, payload);
//jobOutput.data.discount is `5.00`
```

No matter where in the network the calculation is performed (no matter the microservice that is subscribed as the official *worker* to perform the calculation...or even if multiple microservices are invoked during the workflow execution), the answer will always be published back to the originating caller the moment it's ready.

## Workers
Deploy workers by associating functions with a named topic of your choosing. Thereafter, any time PubSubDB runs a `worker` activity that specifies this topic, it will call the function, passing all data described by its schema. Return a response to automatically resume the workflow.

This worker function has been registered to respond to the `discounts.enumerate` topic.

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
      //specify the worker topic
      topic: 'discounts.enumerate',
      store: new RedisStore(redisClient1),
      stream: new RedisStream(redisClient2),
      sub: new RedisSub(redisClient3),


      //register the worker function
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

## Developer Guide
Refer to the [Developer Guide](./docs/developer_guide.md) for more information on the full end-to-end development process, including details about schemas, APIs, and the full deployment lifecycle.

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
