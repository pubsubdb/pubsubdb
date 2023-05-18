# PubSubDB
![alpha release](https://img.shields.io/badge/release-alpha-yellow)

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
PubSub DB apps are modeled using YAML. These can be considered the execution instructions for the app, describing its activity and data flow. For introductory purposes, let's consider the simplest flow possible: *a one-step process*. 

A process with only one step can seem relatively unremarkable. Without additional activities, it is (more-or-less) a traditional data store,  but it serves to reveal the type of information that is tracked by the system and how to take advantage of it. Consider the following relational database table design: a two-column table, indexed on the email, which serves as the primary key.

```sql
CREATE TABLE Order (
    email VARCHAR(255) PRIMARY KEY,
    size ENUM('sm', 'md', 'lg') NOT NULL
);
```

The equivalent declaration in PubSubDB targets an `activity` (not a `table`) but includes similar affordances for setting up indexes and declaring data types. 

```yaml
  order:
    type: trigger
    job:
      schema:
        type: object
        properties:
          email:
            type: string
          size:
            type: string
            enum:
            - sm
            - md
            - lg
      maps:
        email: '{$self.input.data.email}'
        size: '{$self.input.data.size}'
    stats:
      id: '{$self.input.data.email}'
```

Let's start by inserting some data. With a traditional RDS solution, we might use an ORM or update using SQL.

```sql
INSERT INTO Orders (email, size) 
  VALUES ('jdoe@email.com', 'lg');
```

PubSubDB's interface expects a `topic` for identifiying the target (i.e., `item.ordered`), but the mechanics of the interaction are essentially the same.

```ts
const order = pubSubDB.pub('item.ordered', { 'email': 'jdoe@email.com', 'size': 'lg' });
```

Of course, the true benefit of a *process database* like PubSubDB is that it orchestrates and tracks the flow of information over time. Traditional RDS solutions are great at reading and writing snapshots of data, but they're not so great at modeling data in motion--and using that information to trigger and orchestrate a business process. The difference is more apparent as you expand your models and declare additional activities and the transitions between them.

```yaml
transitions:
  a1:
    - to: a2
  a2:
    - to: a3
      conditions:
        match:
          - expected: true
            actual: '{a2.output.data.approved}'
    - to: a4
      conditions:
        match:
          - expected: false
            actual: '{a2.output.data.approved}'
```

Understanding these key concepts is essential for working with the model, as they form the foundation of the application's logic and data flow. Refer to the following documents to better understand the approach and get details on getting started.

## First Principles
Refer to the [Architecture First Principles](./docs/architecture.md) for an overview of why PubSubDB outperforms existing process orchestration platforms.

## Developer Guide
Refer to the [Developer Guide](./docs/developer_guide.md) for more information on the full end-to-end development process, including details about schemas and APIs.

## Model Driven Development
[Model Driven Development](./docs/model_driven_development.md) is a proven approach to managing process-oriented tasks. Refer this guide for an overview of key features.

## Data Mapping
Sharing data between activities is central to PubSubDB. Refer to the [Data Mapping Overview](./docs/data_mapping.md) for more information about supported functions and syntax.

## Composition
The simplest graphs are linear, defining a predictable sequence of non cyclical activities. But graphs can be composed to model complex business scenarios and can even be designed to support long-running workflows lasting weeks or months. Refer to the [Composable Workflow Guide](./docs/composable_workflow.md) for more information.
