# A Distributed Engine Architecture for Operationalizing Data at Scale
There are a set of architectural first-principles that undergird how state and process must be separated to realize the full performance benefit of this scheme. They are inconsequential individually, but when applied as a set, they enable distributed orchestration at scale, without contention, timeout and similar challenges. Orchestration is an emergent property of the data journaling process--a byproduct of saving state to Redis. It is produced without a central governing body, which is why PubSubDB's scale is limited only by Redis' ability to journal state.

- [Foundation](#foundation)
  * [Central Server](#central-server)
  * [Distributed Clients](#distributed-clients)
- [Design Principles](#design-principles)
  * [Sequence Activities with a DAG](#sequence-activities-with-a-dag)
  * [Limit Execution Scope to ECA](#limit-execution-scope-to-eca)
  * [Duplex Activity Execution Calls](#duplex-activity-execution-calls)
  * [Mediate Duplexed Calls With EAI](#mediate-duplexed-calls-with-eai)
  * [Leverage CQRS for Self-Perpetuation](#leverage-cqrs-for-self-perpetuation)
  * [Orchestrate through Collated State](#orchestrate-through-collated-state)
- [Scalability Benefits](#scalability-benefits)
  * [Fan-out Scalability](#fan-out-scalability)
  * [Fan-in Scalability](#fan-in-scalability)
  * [Data Scaling Simplicity](#data-scaling-simplicity)
  * [Engine Scaling Simplicity](#engine-scaling-simplicity)
- [Comparison to Other Architectures](#comparison-to-other-architectures)

## Foundation
The [Ajax/Single Page Application architecture](https://patents.google.com/patent/US8136109) efficiently solves distributed state at scale by cleanly separating data and processing instructions into two distinct channels. PubSubDB is modeled after this architecural pattern, with a reference implementation using Redis as the *Server* and the [PubSubDB NPM package](https://www.npmjs.com/package/@pubsubdb/pubsubdb) as the *Client(s)*. 

### Central Server
In this design, a central server (or a server cluster with a central router) hosts the execution instructions, providing them to each connected client. Importantly, the home server *never* executes the processing instructions it hosts but does serve as the single source of truth for storing the result of each execution.

<img src="https://patentimages.storage.googleapis.com/7e/cb/e1/4d40791b381af8/US08136109-20120313-D00000.png" alt="Patent illustration" style="max-width: 100%;max-height:300px;width:300px;">

### Distributed Clients
Distributed clients register to receive events by subscribing to topics and streams on the central server. As each event is received, each client processes and executes the event using the processing instructions provided by the central server. Clients may cache the processing instructions to streamline execution, but they may not cache the result of an execution and must instead journal state back to the central server.

## Design Principles
The following principles form the basis for the Distributed Client (Engine) design.

### Sequence Activities with a DAG
PubSubDB uses a Directed Acyclic Graph (DAG) variant known as rooted tree to model the activity flow. This was chosen due to its strict enforcement of a single entry point while still allowing for parallel activities. Sequence and parallelization are both critical to building an efficient execution engine, and the DAG is the most efficient representation that achieves this.

<img src="./img/architecture/dag.png" alt="Sequence Activities with a DAG" style="max-width: 100%;max-height:200px;height:200px;">

### Limit Execution Scope to ECA
Event-driven architectures are known for their high performance and ability to handle variable and burst workloads efficiently. In this pattern, publishers send messages without knowing which subscribers, if any, are receiving them. The essential computational unit for event-driven architectures is the Event->Condition->Action (ECA) pattern. The Distributed Event Bus limits its process scope to this single unit of execution before terminating the process.

<img src="./img/architecture/eca.png" alt="Limit Execution Scope to ECA" style="max-width: 100%;max-height:300px;width:280px;">

### Duplex Activity Execution Calls
The conventional ECA (Event-Condition-Action) model treats the *Action* as a single atomic operation, primarily because it does not inherently support state retention. Therefore, in order to handle long-running business processes and ensure uninterrupted data exchange, it becomes necessary to divide the *Action* into two distinct components. This division forms the basis for a full-duplex system, where each activity comprises two legs, "beginning" and "conclusion," bridged by an asynchronous wait state. Importantly, this transformation adheres to the fundamental principles of ECA by giving rise to two distinct ECA sequences for initiating and concluding the activity.

<img src="./img/architecture/duplex.png" alt="Duplex Activity Execution Calls" style="max-width: 100%;max-height:300px;width:280px;">

### Mediate Duplexed Calls with EAI
The transformation of isolated event-driven operations, or ECA units, into cohesive business processes calls for an intermediary abstraction layer to direct and synchronize these individual units, namely, [Enterprise Application Integration](https://en.wikipedia.org/wiki/Enterprise_application_integration) (EAI).

<img src="./img/architecture/eai.png" alt="Mediate Duplexed Calls with EAI" style="max-width: 100%;max-height:300px;width:580px;">

EAI serves as a principal scheme for unification, amalgamating separate ECA units into a comprehensive network of business processes. It ensures that the transmitted data complies with predetermined schemas and data types, allowing the system to convert data from one format to another as it flows from activity to activity.

### Leverage CQRS for Self-Perpetuation
In the orchestration of business processes, *operational continuity* emerges as a critical aspect. This is where Command Query Responsibility Segregation (CQRS) has a pivotal role to play by decoupling the read (query) and write (command) operations in a system. Consider a sequence of tasks: `A`, `B`, and `C`. In a conventional execution flow, the completion of `A` directly initiates `B`, which in turn sets off `C`:

```
A --> B --> C
```

This presents a chain of dependencies where the execution of one task is directly bound to its predecessor, making the system vulnerable to bottlenecks and cascading failures. With CQRS, this is addressed by linking the *logged* completion of `A` to the initiation of `B` and `B`'s *logging* to the initiation of `C`, etc:

```
A --> log[A completed] --> B --> log[B completed] --> C
```

In this scenario, the producers merely inscribe their completion events onto the log. Concurrently, the consumers read from this log. This separation is of key significance: the progression of the workflow is driven not by the producer prompting the next task directly, but by the consumer's act of reading from the log. Note in the following how the Engine and Worker are decoupled from each other (and from the outside callers as well):

<img src="./img/lifecycle/self_perpetuation.png" alt="PubSubDB Self-Perpetuation" style="max-width:100%;width:600px;">

This simple mechanism of reading from one stream and writing to another is the basis for the entire system and how complex workflows are achieved. Every complex workflow is simply a series of singular activities implicitly stitched together by writing to streams in a sequence.

### Orchestrate through Collated State
Efficiently tracking job state is critical to asynchronous workflow systems and is accomplished through a multi-digit collation key that is emitted back to callers upon saving state. 

<img src="./img/architecture/quorum.png" alt="Orchestrate through Collated State" style="max-width: 100%;max-height:300px;width:280px;">

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

The Collation Service employs an ascending string sorting methodology to counter the absence of a sibling node order guarantee in a Directed Acyclic Graph (DAG). Despite the trigger being the first element in the graph, it could be placed fifth alphabetically, as seen in the following sequence:

 `quick => brown => fox => (jumped|(slept => ate))`

The sorted ids for this chain of activities would translate to:

 `["ate", "brown", "fox", "jumped", "quick", "slept"]`

Consequently, the collation key updates to `999969000000000` upon the trigger activity's completion.

Consider the collation key `968969000000000`, which signifies that the `quick` and `brown` activities have *completed* and `fox` is currently *started*. Conversely, a collation key like `766366000000000` symbolizes an *error* state. (The `ate` activity returned an error, and the `jumped` activity was *skipped*, with all other activities concluding normally.) 

The act of the caller saving individual state triggers a server response with full job state. This allows the caller to calculate and journal completion state to the correct 'fan-in' stream target without additional computation or network cost.

## Scalability Benefits
### Fan-out Scalability
PubSubDB supports scale out by distributing processing instructions to a growing number of clients. (*This is an advantage of event-driven architectures and isn't unique to PubSubDB.*) As new clients connect, the home server delivers the instructions, enabling each client to increase the throughput.

### Fan-in Scalability
While fan-in scenarios are typically resource-intensive, PubSubDB efficiently handles them through a combination of CQRS and shared collation state. *There is no **computation** cost associated with tracking deeply nested, compositional state within your workflows. Implementations are only limited by the **memory** constraints of the central data store (e.g, Redis).*

### Data Scaling Simplicity
Since PubSubDB focuses on exchanging pure data, scaling the system becomes more straightforward. The primary concern is managing the data scaling solution, such as Redis, without having to consider the intricacies of the client layer. This separation of concerns simplifies maintainability and ensures that the system can efficiently grow using standard cloud data scaling solutions.

### Engine Scaling Simplicity
An essential aspect of the distributed engine architecture, is that each connected client is responsible for executing their processing instructions independently. Scaling the distributed engine is essentially free, as clients handle the processing and manipulation. The *processing instructions* serve as the source code for the application and are distributed to each connected client on-demand. This approach also allows the system to simultaneously hot-deploy updates to all connected clients without interruption.

## Comparison to Other Architectures
Traditional server-side architectures that rely on in-server engines, such as Redis with Lua, can struggle to scale and maintain performance as the number of clients and processing requirements grow. By avoiding in-server engines and focusing on the core principle of exchanging pure data, the Ajax/Single Page Application architecture is a proven, scalable solution for distributed state management.
