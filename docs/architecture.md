# A Distributed Engine Architecture for Operationalizing Data at Web Scale

- [Introduction](#introduction)
- [Distributed Event Bus](#distributed-event-bus)
- [Architectural First Principles](#architectural-first-principles)
  * [Prioritize Event-Driven Principles](#prioritize-event-driven-principles)
  * [Leverage EAI for Process Coordination](#leverage-eai-for-process-coordination)
  * [Employ Full Duplex Data Exchange to Interleave People](#employ-full-duplex-data-exchange-to-interleave-people)
  * [Leverage Implicit Process Coordination](#leverage-implicit-process-coordination)
- [Scalability Benefits](#scalability-benefits)
  * [Fan-out Scalability](#fan-out-scalability)
  * [Fan-in Scalability](#fan-in-scalability)
  * [Data Scaling Simplicity](#data-scaling-simplicity)
  * [Engine Scaling Simplicity](#engine-scaling-simplicity)
- [Comparison to Other Architectures](#comparison-to-other-architectures)
- [Conclusion](#conclusion)

## Introduction
The [Ajax/Single Page Application architecture](https://patents.google.com/patent/US8136109) efficiently solves distributed state at web scale by cleanly separating data and processing instructions into two distinct channels. A home server provides the instructions to each connected client but does not execute the processing instructions itself. The clients then cache and execute the instructions and exchange pure data (the results of the execution) with the home server.

<img src="https://patentimages.storage.googleapis.com/7e/cb/e1/4d40791b381af8/US08136109-20120313-D00000.png" alt="Patent illustration" style="max-width: 600px;">

## Distributed Event Bus
PubSubDB builds upon the *Distributed Engine* Pattern, delivering a specific type of engine referred to as an *Event Bus* or *Integration Server*. Each time a *Distributed Bus* receives an event, it processes and routes it according to its cached execution rules. The solution is a fully functional *Enterprise Application Integration* (EAI) deployment with all expected execution patterns supported.

## Architectural First Principles
Solving the distributed state challenge, using a *Distributed Event Bus Architecture* offers significant scalability and performance advantages compared to other distributed state management solutions. But these benefits are only possible if the channels (data and execution) are truly separate, requiring a hybrid architecture and concomitant principles.

### Prioritize Event-Driven Principles
Event-driven architectures are known for their high performance and ability to handle variable and burst workloads efficiently. In this pattern, publishers send messages without knowing which subscribers, if any, are receiving them. Subscribers, on the other hand, express interest in specific types of messages and receive only those they are interested in. This decoupling of publishers and subscribers allows the system to evolve and scale independently. *When evaluating competing approaches, event-driven principles always take precedence over all other design patterns.*

### Leverage EAI for Process Coordination
Enterprise Application Integration (EAI) is considered the defining standard for integration architectures due to its universal ability to coordinate data exchange data between service endpoints. Key principles include:

 * A data model that provides a uniform structure for describing data across all services.
 * A connector or agent model that is pluggable and extensible.
 * An independent modeling standard to define public APIs, internal data routing and conditional processing.
 * A **centralized engine** that executes the rules and conditions.

PubSubDb introduces a slight modification to how these principles are *expressed at Web scale* but is otherwise faithful to established precedence.

 * A data model that provides a uniform structure for describing data across all services.
 * A connector or agent model that is pluggable and extensible.
 * An independent modeling standard to define public APIs, internal data routing and conditional processing.
 * A **distributed engine** that executes the rules and conditions.
 * A **centralized data store** that holds all state (including execution and process state).

### Employ Full Duplex Data Exchange to Interleave People
While EAI focuses on real-time, high-performance system-to-system integration, Business Process Management (BPM) deals with roles and activities, primarily concentrating on the human side of business processes. To address the need for long-running business processes while remaining true to the principles of the Event->condition->Action (*EcA*) pattern, PubSubDB splits the Action (**A**) into two parts (A1, A2), executing a single activity in the process flow as a full-duplex data exchange.

### Leverage Implicit Process Coordination
PubSubDB manages process resolution (collation, aggregation, inter-flow coordination, etc) by leveraging a [multi-digit collation key](../services/collator/README.md) that represents the state of all activities in a running flow. Each digit in the collation key corresponds to the status (e.g., 9 for Pending, 8 for Started, 7 for Errored, etc.) for a single activity in the flow. Process state is implicitly managed by updating the collation key each time an activity's state changes. By analyzing the collation key each time it saves data to the backend data store, the distributed bus layer can manage process state without the need for a central server.

## Scalability Benefits
### Fan-out Scalability
The system can easily scale out by distributing processing instructions to a growing number of clients. (*This is an advantage of event-driven architectures and isn't unique to PubSubDB.*) As new clients connect, the home server delivers the instructions, enabling each client to increase the throughput.

### Fan-in Scalability
While fan-in scenarios are typically resource-intensive, PubSubDB efficiently handles them by leveraging the emergent state management capabilities inherent in the architecture. The underlying component model organizes runtime events in a deterministic manner, allowing the system to handle complex dependencies and relationships without sacrificing performance or scalability. *There is no cost associated with tracking deeply nested, compositional state within your workflows. Implementations are only limited by how much data the central data store (e.g, Redis) can support.*

### Data Scaling Simplicity
Since PubSubDB focuses on exchanging pure data, scaling the system becomes more straightforward. The primary concern is managing the data scaling solution, such as Redis, without having to consider the intricacies of the client layer. This separation of concerns simplifies maintainability and ensures that the system can efficiently grow using standard cloud data scaling solutions.

### Engine Scaling Simplicity
An essential aspect of the distributed engine architecture, is that each connected client is responsible for executing thier processing instructions independently. Scaling the distributed engine is essentially free, as clients handle the processing and manipulation.

### Comparison to Other Architectures
Traditional server-side architectures that rely on in-server engines, such as Redis with Lua, can struggle to scale and maintain performance as the number of clients and processing requirements grow. By avoiding in-server engines and focusing on the core principle of exchanging pure data, the Ajax/Single Page Application architecture is a proven, scalable solution for distributed state management.

## Conclusion
In summary, the proposed server-side architecture offers unparalleled scalability and performance advantages, making it an ideal choice for managing distributed state and delivering an operational data layer.
