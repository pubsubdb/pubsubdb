# PubSubDB
![alpha release](https://img.shields.io/badge/release-alpha-yellow)

## Overview
The issue of asymmetry in microservices and the cloud in general isn\'t new. It\'s a significant challenge that solutions like Kafka were designed to address. The core principle behind these solutions is [CQRS](https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs), which separates the responsibility of publishing events and consuming them. This serves to absorb spikes and smooth the flow of information between services.

Consider an analogy: you\'re coordinating a relay race. An event streaming solution like Kafka would serve as your detailed ledger, recording when the race began, who had the baton, when it was passed on, etc. You could wire up consumers to this ledger, developing a real-time app showing runners\' positions, baton handoffs, and timings.

In contrast, think of PubSubDB as an on-the-ground, real-time race coach. It\'s not just logging events—it\'s instructing runners when to start, when to pass the baton, when to stop. It\'s managing the *execution* of the race, rather than simply recording its progress.

This real-time coordination is driven by Redis, which serves as PubSubDB\'s backend. Redis behaves like a flexible buffer, expanding and contracting as necessary to match the pace of information flow. If all receivers perform as expected, Redis stays slim and essentially serves as a network router, executing stateful workflows at stateless speeds.

## Benefits
In the realm of network flow management, PubSubDB enables developers not just to adapt to changes in network flow, but to actively control it. Pause entire work streams, analyze and redirect. Watch as PubSubDB automatically catches up to the current state of the network.

### Uniform Data Exchange
Integrate external SaaS services without burst, timeout or overprovisioning risk.

### Sophisticated Multi-System Workflows
Design long-running multi-step approvals across departments and services.

### Actionable Analytics
Gather actionable insights about aggregate processes over time.

### Loosely Coupled Maintainability
Promote the creation of adaptable, loosely-coupled systems.

## Install
[![npm version](https://badge.fury.io/js/%40pubsubdb%2Fpubsubdb.svg)](https://badge.fury.io/js/%40pubsubdb%2Fpubsubdb)

```sh
npm install @pubsubdb/pubsubdb
```

## Initialize
Pass a Redis client (`redis` and `ioredis` are supported) to serve as the backend when initializing PubSubDB.

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
PubSubDB apps are modeled using YAML. These are the *execution instructions* for the app, describing its activity and data flow. Consider the following example flow that checks if there is a customer discount available for a given product. Note the following:

1. **Subscription and Publishing**: Each YAML file represents a flow of activities within your application, subscribing to and publishing events. In this case, the app subscribes to 'discount.requested' and publishes 'discount.responded' events.

2. **Input\/Output Schemas**: Each YAML file also defines input and output schemas, referenced from another YAML file. These schemas describe the structure of data that the flow expects to receive and send. Each activity can have its own custom schema, separate from the input and output schemas for the overall flow.

3. **Activities**: Activities are the building blocks of your workflow. Each activity, such as 'get_discount' in the example, represents a single step in the process.

4. **Activity Properties**: Each activity contains various properties:
   - `title`: Describes the activity's purpose.
   - `type`: Defines the type of activity, for example, a 'trigger'.
   - `subtype`: For activities like `exec` the subtype is used to identify the specific [worker function](#workers) to execute in job context.
   
5. **Data Mapping**: You'll notice syntax like `{$self.input.data.id}`. This is a way to dynamically map data between activities. The mapping syntax, referred to as [@pipes](./docs/data_mapping.md), allows you to navigate the JSON objects that the workflow is processing.

6. **Conditional Transitions**: Design flows with sophisticated and/or conditions that branch using upstream activity data.

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
    type: exec
    subtype: discounts.enumerate
    ...

transitions:
  get_discount:
    get_available:
      conditions:
        ...
```

## Invoking Your Application's Endpoints
Once your application is deployed and activated, you'll be able to kick off workflows and track their progress. PubSubDB provides three methods for this: 

* *pub* for one-way (fire-and-forget) workflows
* *sub* for global subscriptions for all workflow output
* *pubsub* for stateful, one-time request/response exchanges

### Pub
Suppose you need to kick off a workflow but the answer isn't relevant at this time. You can optionally await the response (the job ID) to confirm that the request was received, but otherwise, this is a simple fire-and-forget call.

```javascript
const topic = 'discount.requested';
const payload = { id: 'ord123', price: 55.99 };
const jobId = await pubSubDB.pub(topic, payload);
//jobId will be `ord123`
```

Fetch the job data at any time (even after the job has completed) using the `getState` method.

```javascript
const job = await pubSubDB.getState(topic, 'ord123');
//{ data: { id: 'ord123', price: 55.99 }, metadata: { ... }}
```   

### Sub
Suppose you need to listen in on the results of all computations on a particular topic, not just the ones you initiated. In that case, you can use the `sub` method.

This is useful in scenarios where you're interested in monitoring global computation results, performing some action based on them, or even just logging them for auditing purposes.

```javascript
await pubSubDB.sub('discount.responded', (topic: string, jobOutput: JobOutput) => {
  //jobOutput.data.discount is `5.00`
});

//publish one test event
const payload = { id: 'ord123', price: 55.99 };
const jobId = await pubSubDB.pub('discount.requested', payload);
```

### PubSub
If you need to kick off a workflow and await the response, use the `pubsub` method. PubSubDB will create a one-time subscription, making it simple to model the request using a standard `await`. The benefit, of course, is that this is a fully duplexed call that adheres to the principles of CQRS, thereby avoiding the overhead of a typical HTTP request/response exchange.

```javascript
const topic = 'discount.requested';
const payload = { id: 'ord123', price: 55.99 };
const jobOutput: JobOutput = await pubSubDB.pubsub(topic, payload);
//jobOutput.data.discount is `5.00`
```

No matter where in the network the calculation is performed (no matter the microservice that is subscribed as the official "handler" to perform the calculation...or even if multiple microservices are invoked during the workflow execution), the answer will always be published back to the originating caller the moment it's ready. It's a one-time subscription handled automatically by the engine, enabling traditional request/response semantics but without network back-pressure risk.

## Workers
Any microservice running an instance of PubSubDB can register a function with a named topic. Thereafter, any time that PubSubDB runs a workflow with an `exec` activity ,that matches this topic, it will call the function in *job* context, passing all job data described by the schema. 

In the following example, PubSubDB is registering a worker to run a function when the `discounts.enumerate` topic is encountered in a flow. The function will execute in buffered job context, isolated from network back-pressure risk. And even if you deploy more workers than engines (even if you introduce asymmetry into the network), PubSubDB will automatically balance network pressure to only run as fast as the slowest endpoint.

```javascript
import {
  PubSubDB,
  PubSubDBConfig,
  RedisStore
  RedisStream
  RedisSub } from '@pubsubdb/pubsubdb';

//init 3 Redis clients
const redisClient1 = getMyRedisClient();
const redisClient2 = getMyRedisClient();
const redisClient3 = getMyRedisClient();

const pubSubDB = await PubSubDB.init({
  appId: "myapp",
  workers: [
    { 
      topic: 'discounts.enumerate',
      store: new RedisStore(redisClient1),
      stream: new RedisStream(redisClient2),
      sub: new RedisSub(redisClient3),
      callback: async (data: StreamData) => {
        //do the work...and return
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
Refer to the [Developer Guide](./docs/developer_guide.md) for more information on the full end-to-end development process, including details about schemas and APIs.

## Model Driven Development
[Model Driven Development](./docs/model_driven_development.md) is a proven approach to managing process-oriented tasks. Refer this guide for an overview of key features.

## Data Mapping
Sharing data between activities is central to PubSubDB. Refer to the [Data Mapping Overview](./docs/data_mapping.md) for more information about supported functions and syntax.

## Composition
The simplest graphs are linear, defining a predictable sequence of non cyclical activities. But graphs can be composed to model complex business scenarios and can even be designed to support long-running workflows lasting weeks or months. Refer to the [Composable Workflow Guide](./docs/composable_workflow.md) for more information.

## First Principles
Refer to the [Architectural First Principles Overview](./docs/architecture.md) for details on why PubSubDB outperforms existing process orchestration platforms.

## Headless Orchestration
PubSubDB is a headless orchestration engine. Refer to the [Headless Orchestration Guide](./docs/headless_orchestration.md) for more information on the approach.

## My First App
Design a [Network Calculator App](./docs/my_first_app.md) to learn the principles behind statefully orchestrating multi-service workflows at asynchronous speeds.
