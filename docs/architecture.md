# A Distributed Engine Architecture for Operationalizing Data at Web Scale

## Introduction
The [Ajax/Single Page Application architecture](https://patents.google.com/patent/US8136109) efficiently solves distributed state at web scale by cleanly separating data and processing instructions into two distinct channels. A home server provides the instructions to each connected client but does not execute the processing instructions itself. The clients then cache the instructions and exchange pure data with the home server. PubSubDB is based upon this principle, and solves the challenge of distributed state by leveraging the *distributed execution engine* pattern.

## Distributed Engine Architecture
In a distributed engine architecture, the home server is responsible for delivering processing instructions to every connected client. Clients cache these instructions and use them to process and manipulate data received from the server. This approach eliminates the need for the server to execute processing instructions, thus reducing the processing overhead and improving performance.

<img src="https://patentimages.storage.googleapis.com/7e/cb/e1/4d40791b381af8/US08136109-20120313-D00000.png" alt="Patent illustration" style="max-width: 600px;">

## Distributed Event Bus
PubSubDB builds upon the distributed engine pattern, delivering a specific type of engine referred to as an *Event Bus* or *Integration Server*. Each time the distributed bus receives an event, it will process and route it according to its cached execution rules. The solution is a fully functional *Enterprise Application Integration* (EAI) deployment with all expected patterns supported, including a functional data mapper and a schema-backed data typing system.

## Scalability and Performance Advantages
Solving the distributed state challenge, using a *Distributed Event Bus Architecture* offers significant scalability and performance advantages compared to other distributed state management solutions. These benefits are primarily achieved through the separation of data and processing instructions which, although simple in concept, scale better than other approaches due to focus on pure data transfer. But the real advantage is only realized if the distributed engines are based upon the principles of Enterprise Application Integration. It is the unique combination of distributed state coupled with the EAI architecture that powers the unmatched scale of the system.

**Fan-out Scalability**: The system can easily scale out by distributing processing instructions to a growing number of clients. (*This is an advantage of event-driven architectures and isn't unique to PubSubDB.*) As new clients connect, the home server delivers the instructions, enabling each client to increase the throughput.

**Fan-in Scalability**: While fan-in scenarios are typically resource-intensive, PubSubDB efficiently handles them by leveraging the emergent state management capabilities inherent in the architecture. The underlying component model organizes runtime events in a deterministic manner, allowing the system to handle complex dependencies and relationships without sacrificing performance or scalability. *There is no cost associated with tracking deeply nested, compositional state within your workflows. You are only limited by how much pure data your Redis instance can exchange.*

**Data Scaling Simplicity**: Since PubSubDB focuses on exchanging pure data, scaling the system becomes more straightforward. The primary concern is managing the data scaling solution, such as Redis, without having to consider the intricacies of the client layer. This separation of concerns simplifies maintainability and ensures that the system can efficiently grow using standard cloud data scaling solutions.

**Engine Scaling Simplicity**: An essential aspect of the distributed engine architecture, is that each connected client is responsible for executing thier processing instructions independently. Scaling the distributed engine is essentially free, as clients handle the processing and manipulation.

**Comparison to Other Architectures**: Traditional server-side architectures that rely on in-server engines, such as Redis with Lua, can struggle to scale and maintain performance as the number of clients and processing requirements grow. By avoiding in-server engines and focusing on the core principle of exchanging pure data, the Ajax/Single Page Application architecture is a proven, scalable solution for distributed state management.

## Conclusion
In summary, the proposed server-side architecture offers unparalleled scalability and performance advantages, making it an ideal choice for managing distributed state and delivering an operational data layer.
