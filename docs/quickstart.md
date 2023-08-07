# Quick Start

The examples provided in this guide are the simplest possible flows that can be defined in PubSubDB. They are intended to be used as a starting point for your own flows as you modify portions to fit your use case. Examples are organized as a story, with each example building upon the prior one for illustrative purposes. But any single example can be used as a starting point if you find it relevant.

**Table of Contents**
- [Setup](#setup)
  - [Install Packages](#install-packages)
  - [Configure and Initialize Redis](#configure-and-initialize-redis)
  - [Configure and Initialize PubSubDB](#configure-and-initialize-pubsubdb)
  - [Define the Application](#define-the-application)
  - [Deploy the Application](#deploy-the-application)
  - [Activate the Application](#activate-the-application)
- [The Simplest Flow](#the-simplest-real-flow)
- [The Simplest Compositional Flow](#the-simplest-compositional-flow)
- [The Simplest Executable Flow](#the-simplest-executable-flow)
- [The Simplest Executable Data Flow](#the-simplest-executable-data-flow)
- [The Simplest Parallel Data Flow](#the-simplest-parallel-data-flow)
- [The Simplest Sequential Data Flow](#the-simplest-sequential-data-flow)

## Setup
### Install Packages
Install the PubSubDB NPM package.

```bash
npm install @pubsubdb/pubsubdb
```

Install the `Redis` or `IORedis` NPM package.

```bash
npm install redis
```

**OR**

```bash
npm install ioredis
```

### Configure and Initialize Redis
Configure and initialize 3 Redis clients.

>The examples in this guide will use the `ioredis` package, but you can use the `redis` package if you prefer.

```javascript
import Redis from 'ioredis';
const config = { host, port, password, db };
const redis1 = new Redis(config);
const redis2 = new Redis(config);
const redis3 = new Redis(config);
```

> Test a connection using a standard Redis `set` command to confirm things are working (e.g, `redis1.set('key', 'value', 'EX', 10)`).

### Configure and Initialize PubSubDB
Now that you have **three** verified Redis instances, pass these to PubSubDB to initialize an engine instance. PubSubDB requires 3 channels when initializing an engine or worker: `store`, `stream`, and `sub`.

 * `store` | the store channel reads and writes flow state (HSET, etc)
 * `stream` | the stream channel drives transitions between activities using Redis Streams to coordinate handoffs
 * `sub` | the sub channel coordinates the fleet of engines (the quorum) using Redis Pub/Sub to synchronize behavior. 

```javascript
import {
  PubSubDB,
  IORedisStore,
  IORedisStream,
  IORedisSub } from '@pubsubdb/pubsubdb';

const pubSubDB = await PubSubDB.init({
  appId: 'abc',
  engine: {
    store: new IORedisStore(redis1),
    stream: new IORedisStream(redis2),
    sub: new IORedisSub(redis3),
  }
});
```

>Import `RedisStore`, `RedisStream`, and `RedisSub` from `@pubsubdb/pubsubdb` if using the `redis` package instead of `ioredis`.

Before running workflows, the application must be *defined*, *deployed*, and *activated*. This is a *one-time activity* that must be called before calling `pub`, `pubsub` and similar application endpoints.

### Define the Application
This first example isn't technically "workflow", but it does represent the simplest app possible: a single flow with a single activity. It's valid YAML, but the app it defines will terminate as soon as it starts. 

Begin by saving the following YAML descriptor using a file name of your choosing (e.g., `abc.1.yaml`). This file will be referenced during the *deploy* step, so make sure you know where it's located.

```yaml
# abc.1.yaml
app:
  id: abc
  version: '1'
  graphs:
    - subscribes: abc.test
      activities:
        t1:
          type: trigger
```

### Deploy the Application
Now that you have a YAML descriptor, you can deploy it to PubSubDB using the `deploy` method. This step compiles and saves the YAML descriptor to Redis where any connected engine or worker can access the rules it defines.

```javascript
await pubSubDB.deploy('./abc.1.yaml');
```

### Activate the Application
Once the YAML descriptor is *deployed* to Redis, you can *activate* it using the `activate` method. This final step leverages the `sub` Redis channel in the background to coordinate quorum behavior across all running instances. This ensures that the entire fleet will simultaneously reference and execute the targeted YAML version.

```javascript
await pubSubDB.activate('1');
```

>The flow is now active and available for invocation from any microservice with a connection to PubSubDB.

Since there are no subsequent activities (this flow only has a single trigger), the flow will terminate immediately and the `response` will only contain `metadata` about the call (e.g., `jid` (job id), `js` (job status), `jc` (job created), etc).

>Notice how the `abc.test` topic is used to trigger the flow. This is the same topic that was defined in the YAML descriptor.

```javascript
const response = await pubSubDB.pubsub('abc.test', {});
console.log(response.metadata);
```

Here is the entire end-to-end example, including the one-time setup steps to deploy and activate the flow:

```javascript
import Redis from 'ioredis';
import {
  PubSubDB,
  IORedisStore,
  IORedisStream,
  IORedisSub } from '@pubsubdb/pubsubdb';

const config = { host, port, password, db };
const redis1 = new Redis(config);
const redis2 = new Redis(config);
const redis3 = new Redis(config);

const pubSubDB = await PubSubDB.init({
  appId: 'abc',
  engine: {
    store: new IORedisStore(redis1),
    stream: new IORedisStream(redis2),
    sub: new IORedisSub(redis3),
  }
});

await pubSubDB.deploy('./abc.1.yaml');
await pubSubDB.activate('1');

const response1 = await pubSubDB.pubsub('abc.test', {});
```

## The Simplest Flow
Graphs need at least one *transition* to be classified as a "workflow". Notice how the graph now includes a `transitions` section to define the activity transition from `t1` to `a1`. Save this YAML descriptor as `abc.2.yaml`.

```yaml
# abc.2.yaml
app:
  id: abc
  version: '2'
  graphs:
    - subscribes: abc.test
      activities:
        t1:
          type: trigger
        a1:
          type: activity
      transitions:
        t1:
          - to: a1
```

Try PubSubDB's **hot deployment** capability by upgrading the `abc` app from version `1` to version `2`.

```javascript
// continued from prior example

await pubSubDB.deploy('./abc.1.yaml');
await pubSubDB.activate('1');

const response1 = await pubSubDB.pubsub('abc.test', {});

await pubSubDB.deploy('./abc.2.yaml');
await pubSubDB.activate('2');

const response2 = await pubSubDB.pubsub('abc.test', {});
```

From the outside (from the caller's perspective), the flow behavior doesn't appear much different. But behind the scenes, two activities will now run when called: the trigger and the activity. The trigger will transition to the activity, and the activity will transition to the end of the flow.

## The Simplest Compositional Flow
This example shows the simplest *compositional flow* possible (where one flow triggers another). Composition allows for standardization and component re-use. Save this YAML descriptor as `abc.3.yaml`:

```yaml
# abc.3.yaml
app:
  id: abc
  version: '3'
  graphs:

    - subscribes: abc.test
      activities:
        t1:
          type: trigger
        a1:
          type: await
          subtype: some.other.topic
      transitions:
        t1:
          - to: a1

    - subscribes: some.other.topic
      activities:
        t2:
          type: trigger
```

Upgrade the `abc` app from version `2` to version `3` and run another test.

```javascript
// continued from prior example

await pubSubDB.deploy('./abc.2.yaml');
await pubSubDB.activate('2');

const response2 = await pubSubDB.pubsub('abc.test', {});

await pubSubDB.deploy('./abc.3.yaml');
await pubSubDB.activate('3');

const response3 = await pubSubDB.pubsub('abc.test', {});
```

From the outside (from the caller's perspective), this flow doesn't appear much different from the prior 2 example flows as it doesn't define any input or output data. But behind the scenes, two flows will run: the first flow will transition from the `trigger` to the `await` activity which will then call the second flow, using the `some.other.topic` topic as the link. The second flow only defines a single `trigger`, so it will terminate immediately after it starts. After flow 2 terminates and returns, the `await` activity will conclude and flow 1 will terminate as well.

## The Simplest Executable Flow
This example shows the simplest *executable flow* possible (where actual work is performed by coordinating and executing functions on your network). Notice how activity, `a1` has been defined as a `worker` type. Save this YAML descriptor as `abc.4.yaml`.

>The `work.do` subtype identifies the worker function to execute. This name is arbitrary and should match the semantics of your use case and the topic space you define for your organization.

```yaml
# abc.4.yaml
app:
  id: abc
  version: '4'
  graphs:
    - subscribes: abc.test
      activities:
        t1:
          type: trigger
        a1:
          type: worker
          subtype: work.do
      transitions:
        t1:
          - to: a1
```

When a `worker` activity is defined in the YAML, you must likewise register a `worker` function that will perform the work. Here is the updated end-to-end example with the entire evolution of the application from version `1` to version `4`. Notice how the `PubSubDB.init` call now registers the worker function, using 3 additional redis connections. Points of presence like this (instance of PubSubDB) can declare a PubSubDB engine and/or one or more workers. The engine is used to coordinate the flow, while the workers are used to perform the work.

```javascript
import Redis from 'ioredis';
import {
  PubSubDB,
  IORedisStore,
  IORedisStream,
  IORedisSub } from '@pubsubdb/pubsubdb';

const config = { host, port, password, db };
const redis1 = new Redis(config);
const redis2 = new Redis(config);
const redis3 = new Redis(config);
const redis4 = new Redis(config);
const redis5 = new Redis(config);
const redis6 = new Redis(config);

const pubSubDB = await PubSubDB.init({
  appId: 'abc',

  engine: {
    store: new IORedisStore(redis1),
    stream: new IORedisStream(redis2),
    sub: new IORedisSub(redis3),
  },

  workers: [
    { 
      topic: 'work.do',
      store: new IORedisStore(redis4),
      stream: new IORedisStream(redis5),
      sub: new IORedisSub(redis6),
      callback: async (data: StreamData) => {
        return {
          metadata: { ...data.metadata },
          data: {} // optional
        };
      }
    }
  ]
});

await pubSubDB.deploy('./abc.1.yaml');
await pubSubDB.activate('1');

const response1 = await pubSubDB.pubsub('abc.test', {});

await pubSubDB.deploy('./abc.2.yaml');
await pubSubDB.activate('2');

const response2 = await pubSubDB.pubsub('abc.test', {});

await pubSubDB.deploy('./abc.3.yaml');
await pubSubDB.activate('3');

const response3 = await pubSubDB.pubsub('abc.test', {});

await pubSubDB.deploy('./abc.4.yaml');
await pubSubDB.activate('4');

const response4 = await pubSubDB.pubsub('abc.test', {});
```

## The Simplest Executable Data Flow
This example shows the simplest *executable data flow* possible (where data described using JSON Schema is exchanged between flows, activities, and worker functions). Notice how input and output schemas have been added to the flow along with mapping statements to bind the data. Save this YAML descriptor as `abc.5.yaml`.

When executed, this flow will expect a payload with a field named 'a' (the input) and will return a payload with a field named 'b' (the output). The input will be provided to the worker function which will modify it and return the output. This output will be surfaced and returned to the caller as the job data (the job response/output).

```yaml
# abc.5.yaml
app:
  id: abc
  version: '5'
  graphs:
    - subscribes: abc.test

      input:
        schema:
          type: object
          properties:
            a:
              type: string

      output:
        schema:
          type: object
          properties:
            b:
              type: string

      activities:
        t1:
          type: trigger
        a1:
          type: worker
          subtype: work.do
          input:
            schema:
              type: object
              properties:
                x:
                  type: string
            maps:
              x: '{t1.output.data.a}'
          output:
            schema:
              type: object
              properties:
                y:
                  type: string
          job:
            maps:
              b: '{$self.output.data.y}'
      transitions:
        t1:
          - to: a1
```

Here is the updated end-to-end example with the entire evolution of the application from version `1` to version `5`. Note how the final response for the workflow now includes the output data from the worker function (`hello world`). All variable names are arbitrary (a, b, x, y). Choose names and structures that reflect your use case.

```javascript
import Redis from 'ioredis';
import {
  PubSubDB,
  IORedisStore,
  IORedisStream,
  IORedisSub } from '@pubsubdb/pubsubdb';

const config = { host, port, password, db };
const redis1 = new Redis(config);
const redis2 = new Redis(config);
const redis3 = new Redis(config);
const redis4 = new Redis(config);
const redis5 = new Redis(config);
const redis6 = new Redis(config);

const pubSubDB = await PubSubDB.init({
  appId: 'abc',

  engine: {
    store: new IORedisStore(redis1),
    stream: new IORedisStream(redis2),
    sub: new IORedisSub(redis3),
  },

  workers: [
    { 
      topic: 'work.do',
      store: new IORedisStore(redis4),
      stream: new IORedisStream(redis5),
      sub: new IORedisSub(redis6),
      callback: async (data: StreamData) => {
        return {
          metadata: { ...data.metadata },
          data: { y: `${data?.data?.x} world` }
        };
      }
    }
  ]
});

await pubSubDB.deploy('./abc.1.yaml');
await pubSubDB.activate('1');
const response1 = await pubSubDB.pubsub('abc.test', {});

await pubSubDB.deploy('./abc.2.yaml');
await pubSubDB.activate('2');
const response2 = await pubSubDB.pubsub('abc.test', {});

await pubSubDB.deploy('./abc.3.yaml');
await pubSubDB.activate('3');
const response3 = await pubSubDB.pubsub('abc.test', {});

await pubSubDB.deploy('./abc.4.yaml');
await pubSubDB.activate('4');
const response4 = await pubSubDB.pubsub('abc.test', {});

await pubSubDB.deploy('./abc.5.yaml');
await pubSubDB.activate('5');
const response5 = await pubSubDB.pubsub('abc.test', { a : 'hello' });
console.log(response5.data.b); // hello world
```

## The Simplest Parallel Data Flow
This example shows the simplest *parallel data flow* possible (where data is produced by two parallel worker function). This flow is relativey unchanged from the prior example with the exception of the addition of a second worker function (`a2`). Save this YAML descriptor as `abc.6.yaml`.

When executed, this flow will expect a payload with a field named 'a' (the input) and will return a payload with fields 'b' and 'c' (the output). Both workers will receive the same input data and operate in parallel, each producing a field in the output. The output will be surfaced and returned to the caller as the job data (the job response/output).

```yaml
# abc.6.yaml
app:
  id: abc
  version: '6'
  graphs:
    - subscribes: abc.test

      input:
        schema:
          type: object
          properties:
            a:
              type: string

      output:
        schema:
          type: object
          properties:
            b:
              type: string
            c:
              type: string

      activities:
        t1:
          type: trigger
        a1:
          type: worker
          subtype: work.do
          input:
            schema:
              type: object
              properties:
                x:
                  type: string
            maps:
              x: '{t1.output.data.a}'
          output:
            schema:
              type: object
              properties:
                y:
                  type: string
          job:
            maps:
              b: '{$self.output.data.y}'
        a2:
          type: worker
          subtype: work.do.more
          input:
            schema:
              type: object
              properties:
                i:
                  type: string
            maps:
              i: '{t1.output.data.a}'
          output:
            schema:
              type: object
              properties:
                o:
                  type: string
          job:
            maps:
              c: '{$self.output.data.o}'
      transitions:
        t1:
          - to: a1
          - to: a2
```

## The Simplest Sequential Data Flow
This example shows how information produced by one worker function can be provided as input to another. This flow is relativey unchanged from the prior example but does modify the `transitions` section, so that both a1 and a2 execute sequentially so that the output from 'a1' is guaranteed to be available as input to 'a2'.

When executed, this flow will expect a payload with a field named 'a' (the input) and will return a payload with fields 'b' and 'c' (the output). The input will be provided to the first worker function which will transform the input. The transformed input will then be passed to the second worker function where it will be further modified. Finally, the output of the second worker function will be returned to the caller as the job data (the job response/output).

```yaml
# abc.7.yaml
app:
  id: abc
  version: '7'
  graphs:
    - subscribes: abc.test

      input:
        schema:
          type: object
          properties:
            a:
              type: string

      output:
        schema:
          type: object
          properties:
            b:
              type: string
            c:
              type: string

      activities:
        t1:
          type: trigger
        a1:
          type: worker
          subtype: work.do
          input:
            schema:
              type: object
              properties:
                x:
                  type: string
            maps:
              x: '{t1.output.data.a}'
          output:
            schema:
              type: object
              properties:
                y:
                  type: string
          job:
            maps:
              b: '{$self.output.data.y}'
        a2:
          type: worker
          subtype: work.do.more
          input:
            schema:
              type: object
              properties:
                i:
                  type: string
            maps:
              i: '{a1.output.data.y}'
          output:
            schema:
              type: object
              properties:
                o:
                  type: string
          job:
            maps:
              c: '{$self.output.data.o}'
      transitions:
        t1:
          - to: a1
        a1:
          - to: a2
```

Here is the updated end-to-end example with the entire evolution of the application from version `1` to version `7`. Note how the final response for workflow 6 will be `{ b: 'hello world', c: 'hello world'}` while the final response for workflow 7 will be `{ b: 'hello world', c: 'hello world world'}`. This is expected as the output of the first worker function is passed to the second worker function in workflow 7, revealing the additive nature of sequential execution.

```javascript
import Redis from 'ioredis';
import {
  PubSubDB,
  IORedisStore,
  IORedisStream,
  IORedisSub } from '@pubsubdb/pubsubdb';

const config = { host, port, password, db };
const redis1 = new Redis(config);
const redis2 = new Redis(config);
const redis3 = new Redis(config);
const redis4 = new Redis(config);
const redis5 = new Redis(config);
const redis6 = new Redis(config);
const redis7 = new Redis(config);
const redis8 = new Redis(config);
const redis9 = new Redis(config);

const pubSubDB = await PubSubDB.init({
  appId: 'abc',

  engine: {
    store: new IORedisStore(redis1),
    stream: new IORedisStream(redis2),
    sub: new IORedisSub(redis3),
  },

  workers: [
    { 
      topic: 'work.do',
      store: new IORedisStore(redis4),
      stream: new IORedisStream(redis5),
      sub: new IORedisSub(redis6),
      callback: async (data: StreamData) => {
        return {
          metadata: { ...data.metadata },
          data: { y: `${data?.data?.x} world` }
        };
      }
    },

    { 
      topic: 'work.do.more',
      store: new IORedisStore(redis7),
      stream: new IORedisStream(redis8),
      sub: new IORedisSub(redis9),
      callback: async (data: StreamData) => {
        return {
          metadata: { ...data.metadata },
          data: { o: `${data?.data?.i} world` }
        };
      }
    }

  ]
});

await pubSubDB.deploy('./abc.1.yaml');
await pubSubDB.activate('1');
const response1 = await pubSubDB.pubsub('abc.test', {});

await pubSubDB.deploy('./abc.2.yaml');
await pubSubDB.activate('2');
const response2 = await pubSubDB.pubsub('abc.test', {});

await pubSubDB.deploy('./abc.3.yaml');
await pubSubDB.activate('3');
const response3 = await pubSubDB.pubsub('abc.test', {});

await pubSubDB.deploy('./abc.4.yaml');
await pubSubDB.activate('4');
const response4 = await pubSubDB.pubsub('abc.test', {});

await pubSubDB.deploy('./abc.5.yaml');
await pubSubDB.activate('5');
const response5 = await pubSubDB.pubsub('abc.test', { a : 'hello' });
console.log(response5.data.b); // hello world

await pubSubDB.deploy('./abc.6.yaml');
await pubSubDB.activate('6');
const response6 = await pubSubDB.pubsub('abc.test', { a : 'hello' });
console.log(response6.data.b); // hello world
console.log(response6.data.c); // hello world

await pubSubDB.deploy('./abc.7.yaml');
await pubSubDB.activate('7');
const response7 = await pubSubDB.pubsub('abc.test', { a : 'hello' });
console.log(response7.data.b); // hello world
console.log(response7.data.c); // hello world world
```
