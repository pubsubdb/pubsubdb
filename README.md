# PubSubDB
![alpha release](https://img.shields.io/badge/release-alpha-yellow)

## Overview
*Take control of your critical business processes.* [[video (50s)]](https://www.loom.com/share/f17c9e856d844176b1014b0ee20c57ce)

PubSubDB orchestrates and monitors distributed, durable workflows. [Refactor your existing microservices](./docs/refactoring101.md) or design processes from scratch. With integrated telemetry, your functions are executed in context of the entire event stream that precedes and follows. Gather real-time insight into your critical business processes and set alarms and alerts on target thresholds.

## Install
[![npm version](https://badge.fury.io/js/%40pubsubdb%2Fpubsubdb.svg)](https://badge.fury.io/js/%40pubsubdb%2Fpubsubdb)

```sh
npm install @pubsubdb/pubsubdb
```

## Design
Use [YAML](./docs/quickstart.md) to define the activity sequences that make up your workflows. By associating any function on your network with a topic in the YAML definition, PubSubDB will trigger your function when the flow runs. With retry and idempotency support baked in, PubSubDB provides durable function execution regardless of legacy network complexity.

```yaml
app:
  id: sandbox
  version: '1'
  graphs:
    - subscribes: sandbox.work.do
      publishes: sandbox.work.done

      activities:
        gateway:
          type: trigger
        servicec:
          type: worker
          subtype: sandbox.work.do.servicec
        serviced:
          type: worker
          subtype: sandbox.work.do.serviced
        sforcecloud:
          type: worker
          subtype: sandbox.work.do.sforcecloud

      transitions:
        gateway:
          - to: servicec
        servicec:
          - to: serviced
        serviced:
          - to: sforcecloud
```

The activities defined in the YAML are metered in the context of the complete process, offering real-time, unified insights into your legacy functions. Detailed telemetry data includes execution time, run count (and retry count), and the number of errors encountered.

<img src="./docs/img/open_telemetry.png" alt="Open Telemetry" style="width:600px;max-width:600px;">

Designing workflows with PubSubDB is straightforward and effective, especially when dealing with legacy microservice networks. For a deeper dive into how you can transform your microservices and benefit from PubSubDB, see the [Refactoring 101 Guide](./docs/refactoring101.md).

## Initialize
To initialize PubSubDB, pass in **three** Redis clients. This 3-channel design is crucial for its autonomous operation. PubSubDB utilizes the *store* to maintain the workflow state, the *stream* to guide activity transitions, and the *sub* to synchronize the [quorum](./docs/architecture.md) of engines.

>Note: PubSubDB supports both ioredis and redis clients.

```javascript
import {
  PubSubDB,
  IORedisStore,
  IORedisStream,
  IORedisSub } from '@pubsubdb/pubsubdb';

//use ioredis OR redis
import Redis from 'ioredis';
const config = { host, port, password, db };
const redis1 = new Redis(config);
const redis2 = new Redis(config);
const redis3 = new Redis(config);

const pubSubDB = await PubSubDB.init({
  appId: 'sandbox',
  engine: {
    store: new IORedisStore(storeClient),
    stream: new IORedisStream(streamClient),
    sub: new IORedisSub(subClient),
  }
});
```

## Trigger a Workflow
Call `pub` to initiate a workflow. This function returns a job ID that allows you to monitor the progress of the workflow.

```javascript
const topic = 'sandbox.work.do';
const payload = { };
const jobId = await pubSubDB.pub(topic, payload);
```

## Subscribe to Events
Call `sub` to subscribe to all workflow results for a given topic.

```javascript
await pubSubDB.sub('sandbox.work.done', (topic, jobOutput) => {
  // use jobOutput.data
});
```

## Trigger and Wait
Call `pubsub` to start a workflow and *wait for the response*. PubSubDB establishes a one-time subscription and delivers the job result once the workflow concludes.

```javascript
const jobOutput = await pubSubDB.pubsub(topic, payload);
```

>The `pubsub` method is a convenience function that merges pub and sub into a single call. Opt for PubSubDB's queue-driven engine over fragile HTTP requests to develop resilient, scalable, and high-performance solutions.

## Link Worker Functions
Link worker functions to a topic of your choice. When a workflow activity in the YAML definition with a corresponding topic runs, PubSubDB will invoke your function.

```javascript
//use ioredis OR redis
import Redis from 'ioredis';
import {
  PubSubDB,
  IORedisStore
  IORedisStream
  IORedisSub } from '@pubsubdb/pubsubdb';

const config = { host, port, password, db };
const redis1 = new Redis(config);
const redis2 = new Redis(config);
const redis3 = new Redis(config);

const pubSubDB = await PubSubDB.init({
  appId: 'sandbox',
  workers: [
    { 
      topic: 'sandbox.work.do.servicec',

      store: new IORedisStore(redis1),
      stream: new IORedisStream(redis2),
      sub: new IORedisSub(redis3),

      callback: async (data: StreamData) => {
        return {
          metadata: { ...data.metadata },
          data: { }
        };
      }
    }
  ]
};
```

## FAQ
Refer to the [FAQ](./docs/faq.md) for terminology, definitions, and an exploration of how PubSubDB facilitates orchestration use cases.

## Quick Start
Refer to the [Quick Start](./docs/quickstart.md) for sample flows you can easily copy, paste, and modify to get started.

## Developer Guide
For more details on the complete development process, including information about schemas, APIs, and deployment, consult the [Developer Guide](./docs/developer_guide.md).

## Model Driven Development
[Model Driven Development](./docs/model_driven_development.md) is an established strategy for managing process-oriented tasks. Check out this guide to understand its foundational principles.

## Data Mapping
Exchanging data between activities is central to PubSubDB. For detailed information on supported functions and the functional mapping syntax (@pipes), see the [Data Mapping Overview](./docs/data_mapping.md).

## Composition
While the simplest graphs are linear, detailing a consistent sequence of non-cyclical activities, graphs can be layered to represent intricate business scenarios. Some can even be designed to accommodate long-lasting workflows that span months. For more details, check out the [Composable Workflow Guide](./docs/composable_workflow.md).

## Architectural First Principles
For a deep dive into PubSubDB's distributed orchestration philosophy, refer to the [Architectural First Principles Overview](./docs/architecture.md).

## Distributed Orchestration
PubSubDB is a distributed orchestration engine. Refer to the [Distributed Orchestration Guide](./docs/distributed_orchestration.md) for a detailed breakdown of the approach.

## System Lifecycle
Gain insight into the PubSubDB's monitoring, exception handling, and alarm configurations via the [System Lifecycle Guide](./docs/system_lifecycle.md).
