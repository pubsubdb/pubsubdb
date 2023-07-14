# A Distributed Engine Architecture for Operationalizing Data at Web Scale

- [Introduction](#introduction)
- [First Principles](#first-principles)
  * [Sequence Activities with a DAG](#sequence-activities-with-a-dag)
  * [Limit Execution Scope to ECA](#limit-execution-scope-to-eca)
  * [Duplex Activity Execution Calls](#duplex-activity-execution-calls)
  * [Mediate Duplexed Calls With EAI](#mediate-duplexed-calls-with-eai)
  * [Leverage CQRS for Self-Perpetuation](#leverage-cqrs-for-self-perpetuation)
  * [Orchestrate through Emergent State](#orchestrate-through-emergent-state)
- [Scalability Benefits](#scalability-benefits)
  * [Fan-out Scalability](#fan-out-scalability)
  * [Fan-in Scalability](#fan-in-scalability)
  * [Data Scaling Simplicity](#data-scaling-simplicity)
  * [Engine Scaling Simplicity](#engine-scaling-simplicity)
- [Comparison to Other Architectures](#comparison-to-other-architectures)

## Introduction
The [Ajax/Single Page Application architecture](https://patents.google.com/patent/US8136109) efficiently solves distributed state at Web scale by cleanly separating data and processing instructions into two distinct channels. PubSubDB is modeled using this architecural Pattern, with a reference implementation using Redis as the *Server* and PubSubDB as the *Client(s)*. 

### Central Server
A home server provides the instructions to each connected client, journaling all events in an immutable ledger. Importantly, the home server *never* executes its processing instructions but does serve as the single source of truth for storing the results.

<img src="https://patentimages.storage.googleapis.com/7e/cb/e1/4d40791b381af8/US08136109-20120313-D00000.png" alt="Patent illustration" style="max-width: 100%;max-height:300px;width:300px;">

### Distributed Clients
Each time a client receives an event, it processes and routes it according to its cached instruction sets received from the server. Clients *never* retain state (they never journal the events they process) but are allowed to cache the execution rules as they are immutable.

## First Principles
There are a set of architectural first-principles that undergird how state and process must be separated to realize the full performance benefit of this scheme. They are inconsequential individually, but when applied as a set, they enable distributed computation at scale, without back-pressure, overflow, timeout and other risks typically associated with networked systems.

By converting the application into a series of stateless, single-purpose execution instructions, the network expands and contracts in real-time to absorb assymetry at its source. And it does so entirely headless without a central governing body, which is why its scale is limited only by Redis' ability to scale.

### Sequence Activities with a DAG
PubSubDB uses a Directed Acyclic Graph (DAG) variant known as rooted tree to model the activity flow. This was chosen due to its strict enforcement of a single entry point while still allowing for parallel activities. Sequence and parallelization are both critical to building an efficient execution engine, and the DAG is the most efficient representation that achieves this.

<img src="./img/architecture/dag.png" alt="Sequence Activities with a DAG" style="max-width: 100%;max-height:200px;height:200px;">

### Limit Execution Scope to ECA
Event-driven architectures are known for their high performance and ability to handle variable and burst workloads efficiently. In this pattern, publishers send messages without knowing which subscribers, if any, are receiving them. The essential computational unit for event-driven architectures is the Event->Condition->Action (ECA) pattern. The Distributed Event Bus limits its process scope to this single unit of execution before terminating the process.

<img src="./img/architecture/eca.png" alt="Limit Execution Scope to ECA" style="max-width: 100%;max-height:300px;width:280px;">

### Duplex Activity Execution Calls
To address the need for long-running business processes, including those that support human activities while remaining true to the principles of the ECA pattern, the Distributed Event Bus splits the Action (A) into two parts, executing a single activity in the process flow as a full-duplex data exchange.  When executed by the engine each activity begins with part 2 of the parent activity's call and concludes with part 1 of the child activity's call. This enables the Async/Await pattern, making it possible to pause any high-throughput execution and interleave human activities like reviews and approvals (again, without performance cost).

<img src="./img/architecture/duplex.png" alt="Duplex Activity Execution Calls" style="max-width: 100%;max-height:300px;width:280px;">

### Mediate Duplexed Calls with EAI
[Enterprise Application Integration](https://en.wikipedia.org/wiki/Enterprise_application_integration) (EAI) is considered the defining standard for integration architectures due to its universal ability to coordinate data exchange between service endpoints. It was chosen for this reason to serve as the glue between the ECA units of execution and convert the event stream into meaningful business processes. The architecture is rigorous and requires strict adherence to schemas and types when transmitting data. Key features include a uniform data model and a pluggable connector/adapter model.

<img src="./img/architecture/eai.png" alt="Mediate Duplexed Calls with EAI" style="max-width: 100%;max-height:300px;width:580px;">

### Leverage CQRS for Self-Perpetuation
In the orchestration of business processes, *operational continuity* emerges as a critical aspect. This is where Command Query Responsibility Segregation (CQRS) has a pivotal role to play by decoupling the read (query) and write (command) operations in a system. Consider a sequence of tasks: `A`, `B`, and `C`. In a conventional execution flow, the completion of `A` directly initiates `B`, which in turn sets off `C`:

```
A --> B --> C
```

This presents a chain of dependencies where the execution of one task is directly bound to its predecessor, making the system vulnerable to bottlenecks and cascading failures. With CQRS, this is addressed by linking the *logged* completion of `A` to the initiation of `B` and `B`'s *logging* to the initiation of `C`, etc:

```
A --> log[A completed] --> B --> log[B completed] --> C
```

In this scenario, the producers (tasks) merely inscribe their completion events onto the log. Concurrently, the consumers (the triggers for ensuing tasks) read from this log. This separation is of key significance: the progression of the workflow is driven not by the producer prompting the next task directly, but by the consumer's act of reading from the log. Note in the following how the Engine and Worker are decoupled from each other (and from the outside callers as well):

<img src="./img/lifecycle/self_perpetuation.png" alt="PubSubDB Self-Perpetuation" style="max-width:100%;width:600px;">

This simple mechanism of reading from one stream and writing to another is the basis for the entire system and how complex workflows are achieved. Every complex workflow is simply a series of singular activities implicitly stitched together by writing to streams in a sequence.

### Orchestrate through Emergent State
Activity collation forms the nexus of an asynchronous workflow system, bearing the critical responsibility of tracing and managing the state of all activities within an active process or a "Job". This task is accomplished through a multi-digit collation key. Each digit within this key is a symbolic representation of the status of a specific activity in the workflow.

<img src="./img/architecture/quorum.png" alt="Orchestrate through Emergent State" style="max-width: 100%;max-height:300px;width:280px;">

The collation key structure is conceived with explicit numeric values designated for various states an activity might exhibit:

- 9: Pending
- 8: Started
- 7: Errored
- 6: Completed
- 5: Paused
- 4: Released
- 3: Skipped
- 2: `Await` Right Parentheses
- 1: `Await` Left Parentheses
- 0: N/A (the flow has fewer activities than the collation key)

This structured approach empowers a quick understanding of the job's current state from a mere glance at the collation key. Moreover, two special digits, 1 and 2, are designated for 'bookending' subordinated workflows, a design decision that streamlines the expression of a composite job state. For example, a composite state of `36636146636626` tells us that two separate workflows, Flow A and Flow B, have concluded successfully, where Activity 5 in Flow A spawned Flow B, and the latter returned its response successfully.

## Scalability Benefits
### Fan-out Scalability
PubSubDB supports scale out by distributing processing instructions to a growing number of clients. (*This is an advantage of event-driven architectures and isn't unique to PubSubDB.*) As new clients connect, the home server delivers the instructions, enabling each client to increase the throughput.

### Fan-in Scalability
While fan-in scenarios are typically resource-intensive, PubSubDB efficiently handles them by leveraging the emergent state management capabilities inherent in the architecture. The underlying component model organizes runtime events in a deterministic manner, allowing the system to handle complex dependencies and relationships without sacrificing performance or scalability. *There is no **performance** cost associated with tracking deeply nested, compositional state within your workflows. Implementations are only limited by the **memory** constraints of the central data store (e.g, Redis).*

### Data Scaling Simplicity
Since PubSubDB focuses on exchanging pure data, scaling the system becomes more straightforward. The primary concern is managing the data scaling solution, such as Redis, without having to consider the intricacies of the client layer. This separation of concerns simplifies maintainability and ensures that the system can efficiently grow using standard cloud data scaling solutions.

### Engine Scaling Simplicity
An essential aspect of the distributed engine architecture, is that each connected client is responsible for executing thier processing instructions independently. Scaling the distributed engine is essentially free, as clients handle the processing and manipulation.

## Comparison to Other Architectures
Traditional server-side architectures that rely on in-server engines, such as Redis with Lua, can struggle to scale and maintain performance as the number of clients and processing requirements grow. By avoiding in-server engines and focusing on the core principle of exchanging pure data, the Ajax/Single Page Application architecture is a proven, scalable solution for distributed state management.
