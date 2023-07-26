# PubSubDB FAQ

## What is a Process Database?
Similar to how a relational database provides tools for modeling *tables* and  *relationships*, a process database provides tools for modeling *activities* and *transitions*. Constructs like "reading" and "writing" data still remain; however, instead of reading and writing to *tables*, the targets are *jobs* and *flows*. Importantly, the act of reading and writing data drives the perpetual behavior of the system, delivering process orchestration through the simple act of journaling state.

## What is PubSubDB?
PubSubDB (a Process Database) is a wrapper for Redis that exposes a higher level set of domain constructs like ‘activities’, ‘jobs’, ‘flows’, etc. Behind the scenes, it uses *Redis Data* (Hash, ZSet, and List); *Redis Streams* (XReadGroup, XAdd, XLen) and *Redis Publish/Subscribe*.

## What gets installed?
PubSubDB is a lightweight NPM package (500KB) that gets installed anywhere a connection to Redis is needed. The entire process is invisible, and it’s easy to set up, as you’re reusing existing Redis connections. Essentially you call higher-level methods provided by PubSubDB (pub, sub, pubsub, etc) instead of the lower-level Redis commands (hset, xadd, etc).

## Is PubSubDB an Orchestration Hub/Bus?
Yes and No. PubSubDB was designed to deliver the functionality of an orchestration server but without the additional infrastructure demands of a traditional server. Only the outcome (process orchestration) exists. The server itself is an emergent property of the data journaling process.

## How does PubSubDB operate without a central controller?
PubSubDB is designed as a [distributed headless engine](./architecture.md) based upon the principles of CQRS. According to CQRS, *consumers* are instructed to read events from assigned topic queues while *producers* write to said queues. This division of labor is essential to the smooth running of the system. PubSubDB leverages this principle to drive the perpetual behavior of engines and workers (along with other strategies described [here](./architecture.md)). 

As long as a topic queue has items, consumers will read exactly one and then journal the result to another queue. As long as all consumers (engines and workers) follow this one rule, complex, composable, multi-system workflows emerge. The "secret" to the process is to model the desired process using a DAG and then compile it into singular, stateless events that are just the right shape to be processed according to CQRS principles.

## Why not use Kafka?
Kafka (Kinesis, etc) were designed with CQRS in mind. They are journaling technologies with write guarantees baked in. The logs produced are immutable allowing for tail compaction and append-only writes to the head. Consumers are separate from Producers in this system and can be installed separately to consume the log data in a manner that makes sense for the use case at hand.

The use case provided by PubSubDB is fully in-memory and provides a level of real-time interaction not guaranteed by Kafka as Kafka is a write-based system that only describes how the producer must log all events. Consumers can be installed to read from these logs, but there are no existing Kafka implementations that provide real time, composable activity orchestration. It is not a primary use case for Kafka, but one could build it using custom code and a mix of existing packages.

It is important to note that PubSubDB is complementary to Kafka. It requires less change to implement, using existing legacy hardware and infrastructure (it’s just an NPM package). PubSubDB can serve as the glue between legacy systems and Kafka as its event-driven approach is complementary to both systems.

## Does Redis Support Kafka-like features (single producer, etc)?
Yes, Redis streams provide much of what Kafka does out of the box. There are slight differences, but the core principle of sequence and order serve to organize events into topics, so they can be processed by consumer groups. Blocking, one-time-delivery and similar concepts are supported.

## What is the purpose of pubSubDB.pub?
Call `pub` to kick off a workflow. It’s a one-way fire-and-forget call. The job id is returned but otherwise there is nothing to track.

## What is the purpose of pubSubDB.sub?
Call `sub` to listen in on the outcome of any targeted topic. This is standard fan-out behavior that one would expect from a pub/sub implementation. Log events to DataDog, look for interesting values in the message stream, etc. This is a simple way to get event-driven insights into the running system and would be preferable to legacy approaches like long-polling where one would continually poll the system to get the latest job status(es).

## What is the purpose of pubSubDB.pubsub?
Call `pubsub` from your legacy system to kick off a workflow and wait for the response. PubSubDB is an in-memory orchestrator/router and effortlessly handles complex, multi-dimensional, multi-system workflows but can also be used to call one microservice from another (like Node Fetch) at rates that are comparable to a standard ELB.

## Can you update a running deployment?
Yes, but you must make principled changes. If you update your model and delete everything, it will break. But if you want to add additional logic (like a new activity), it’s supported. Adding and updating logic is relatively straightforward, while deprecation is preferable to deletion.

The system is designed to deploy new versions (the YAML execution rules) to Redis where they are held as the single source of truth. All running engines are then asked to join in a game of ping pong. If every running engine in the quorum simultaneously says “pong” 4 times in a row, then the quorum is considered to be “healthy” and “unified” and capable of real-time upgrades. 

At this moment, a fifth and final message goes out, instructing all clients to stop using cached execution rules without first querying for the active version. All engines continue to run and use their cached execution rules, but they will always confirm the version to use with an extra real-time call to the server each time they process a message. 

Finally, the lead server in the quorum will update the active version, forcing all connected engines to formally cache the execution rules for this latest version target and cease making the extra version check with each call.
