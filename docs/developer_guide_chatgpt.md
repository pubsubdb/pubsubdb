

## Table of Contents
1. [Introduction](#introduction)
2. [Define the Business Process](#define-the-business-process)
3. [Define Activity Graphs](#define-activity-graphs)
4. [Define Conditional Activities](#define-conditional-activities)
5. [Define Activity Topics](#define-activity-topics)
6. [Organizing Files for Maintainability](#organizing-files-for-maintainability)
7. [Define Activity Schemas](#define-activity-schemas)
8. [Define Mapping Rules](#define-mapping-rules)
9. [Define Statistics](#define-statistics)
10. [Plan](#plan)
11. [Deploy](#deploy)
12. [Trigger Workflow Job](#trigger-workflow-job)
13. [Get Job Data](#get-job-data)
14. [Retrieve Job Metadata](#retrieve-job-metadata)
15. [Get Aggregate Job Statistics](#get-aggregate-job-statistics)

## 1. Introduction

### 1.1 <a name="overview-of-pubsubdb"></a>Overview of PubSubDB

PubSubDB applies the principles of a publish-subscribe messaging system to business workflows, allowing for the creation of complex data pipelines and real-time analytics.

The platform enables users to define, orchestrate, and monitor data processing tasks in a highly scalable manner using a standard key/value store on the backend (e.g, Redis). 

PubSubDB supports the creation of custom business processes, activity graphs, and conditional activities to suit various use cases, ensuring that your data flows smoothly and securely through the system.

### 1.2 <a name="terminology"></a>Terminology

Before diving into the details of the PubSubDB platform, it's essential to understand some key terms:

- **Business Process:** A high-level definition of a data processing workflow, representing the sequence of operations that transform raw data into meaningful information.
- **Activity Graph:** A directed acyclic graph (DAG) that defines the relationships between various activities in a business process.
- **Activity:** A single unit of work or operation in a business process. Activities can be simple, like reading data from a source, or complex, involving multiple steps and conditions.
- **Topic:** A named channel through which messages are sent and received in the PubSubDB system. Topics allow for efficient and organized communication between different activities.
- **Schema:** A description of the data structure used in an activity. Schemas help validate incoming data and ensure consistency throughout the workflow.
- **Mapping Rules:** Rules that define how data is transformed and processed between activities. Mapping rules are essential for ensuring that data flows correctly through the system.
- **Statistics:** Metrics and data points gathered during the execution of a business process. Statistics provide insights into the performance and efficiency of the workflow.

### 1.3 <a name="prerequisites"></a>Prerequisites

Before starting with the development process, make sure you have the following prerequisites:

1. **Access to PubSubDB:** You should have access to the PubSubDB platform and the necessary permissions to create and manage business processes.
2. **Programming experience:** Familiarity with programming concepts and general software development practices is essential for developing efficient workflows.
3. **Knowledge of data processing:** Understanding basic data processing concepts, such as filtering, transformation, and aggregation, will help you design effective business processes.
4. **Markdown editor:** A markdown editor, such as Visual Studio Code or Atom, will be helpful for writing and managing the documentation of your business process.

## 2. Define the Business Process

### 2.1 <a name="identify-subprocesses"></a>Identify Subprocesses

To define a business process, first, break down the process into smaller, manageable subprocesses. This will help you understand the overall structure and dependencies of the process. Identify the inputs and outputs for each subprocess and their interactions with other subprocesses. This analysis will form the basis for creating activity graphs and mapping rules in the later stages of development. 

1. **List down the subprocesses:** Write down all the subprocesses involved in the business process.
2. **Identify dependencies:** Determine the dependencies between the subprocesses and the order in which they should be executed.
3. **Define inputs and outputs:** Specify the inputs and outputs for each subprocess, along with their data types and structures.

### 2.2 <a name="example-business-process"></a>Example Business Process

Let's consider a simple example of a business process: processing a customer order. We can break down this process into the following subprocesses:

1. Validate order details
2. Check product availability
3. Calculate shipping cost
4. Process payment
5. Update inventory
6. Generate shipping label
7. Notify customer

In this example, each subprocess has specific inputs and outputs, as well as dependencies on other subprocesses. For instance, the "Process payment" subprocess depends on the outputs of "Validate order details," "Check product availability," and "Calculate shipping cost."

By breaking down the business process into smaller subprocesses, you can now start working on defining activity graphs, mapping rules, and other components needed to implement this process using PubSubDB.

### 3.1 <a name="graph-notation"></a>Graph Notation

Activity graphs are directed graphs that represent the flow of data and control in your business process. In an activity graph, nodes represent activities, and edges represent dependencies between activities. 

To define an activity graph, you can use the following notation:

- `A`: Activity A
- `A -> B`: Activity A depends on Activity B
- `[A, B] -> C`: Activity C depends on both Activities A and B
- `A -> [B, C]`: Activity A depends on either Activity B or Activity C

This notation allows you to easily specify the dependencies between activities in your business process, helping you create a clear and concise representation of the process.

### 3.2 <a name="example-activity-graphs"></a>Example Activity Graphs

Let's look at an example activity graph for a simple order processing system:

A -> B -> C


In this example:

- Activity A: Customer places an order
- Activity B: Warehouse processes the order
- Activity C: Order is shipped to the customer

The graph indicates that the order processing system follows a linear flow, with each activity depending on the completion of the previous one.

Here's another example with parallel and conditional activities:

A -> [B, C] -> D


In this example:

- Activity A: Customer places an order
- Activity B: Warehouse processes the order
- Activity C: Customer service confirms the order details
- Activity D: Order is shipped to the customer

In this graph, both Activities B and C are executed in parallel after Activity A. Activity D depends on the completion of both Activities B and C. This graph represents a more complex order processing system with additional validation steps.

### 3.2 <a name="example-activity-graphs"></a>Example Activity Graphs

Let's look at an example activity graph for a simple order processing system:

```
A -> B -> C
```

In this example:

- Activity A: Customer places an order
- Activity B: Warehouse processes the order
- Activity C: Order is shipped to the customer

The graph indicates that the order processing system follows a linear flow, with each activity depending on the completion of the previous one.

Here's another example with parallel and conditional activities:

```
A -> [B, C] -> D
```

In this example:

- Activity A: Customer places an order
- Activity B: Warehouse processes the order
- Activity C: Customer service confirms the order details
- Activity D: Order is shipped to the customer

In this graph, both Activities B and C are executed in parallel after Activity A. Activity D depends on the completion of both Activities B and C. This graph represents a more complex order processing system with additional validation steps.

### 4.1 <a name="branching-and-conditions"></a>Branching and Conditions

Conditional activities in a workflow allow you to control the flow of execution based on specific conditions. You can use branching to define multiple paths of execution, with each branch representing a different outcome. The conditions are typically based on the data associated with the workflow or the results of previous activities.

To define conditional activities, you need to:

1. Identify the decision points in your business process.
2. Specify the conditions that will determine which branch to follow.
3. Define the activities to be executed in each branch.

To represent conditional activities in the activity graph, use the following notation:

```
A -> (Condition) -> [B, C]
```

In this example, Activity A is followed by a decision point (Condition). Depending on the outcome of the condition, either Activity B or Activity C will be executed.

It's important to note that conditions should be deterministic and based on the current state of the workflow or the data generated by previous activities. This ensures that the workflow execution is consistent and predictable.

### 4.2 <a name="example-conditional-activities"></a>Example Conditional Activities

Let's consider an example business process that involves approving a purchase request. The process includes the following activities:

1. Submit purchase request
2. Review purchase request
3. Approve purchase request
4. Reject purchase request
5. Notify the requester

We can use conditional activities to model this process in a workflow. Here's an example activity graph:

```
Submit -> Review -> (Request Approved?) -> [Approve, Reject] -> Notify
```

In this example, after the purchase request is reviewed, the workflow reaches a decision point (Request Approved?). Depending on the outcome of the review, the workflow will either execute the Approve activity or the Reject activity. After the appropriate activity is executed, the Notify activity will be executed to inform the requester of the decision.

To define the condition, you can use a simple Boolean expression or a more complex function that evaluates the data associated with the workflow. For example, you might define the condition as follows:

```
Request Approved? = (Review Result == "Approved")
```

This condition checks if the result of the review activity is "Approved" and follows the appropriate branch accordingly.

## Define Mapping Rules

Mapping rules in PubSubDB enable the transfer and transformation of data between activities as the workflow executes. By leveraging a functional approach with support for the full ECMA standard, PubSubDB provides a powerful and flexible data mapping mechanism. 

### Mapping Data

In PubSubDB, mapping is driven by the subscriber (the downstream activity). Mapping rules can apply static character data (like a fixed string or number) or data produced by upstream activities. For more information on the range of possible mapping transformations, refer to the [Data Mapping Overview](./data_mapping.md).

To define mapping rules, create a *mapping rules file* and reference it from your workflow (similar to how schemas are referenced). Save the mapping file to the `./maps` subdirectory, using the recommended topic naming standard where *the file is named using the workflow topic with which it is associated*:

```yaml
# ./src/maps/order.approval.price.requested.yaml
a6:
  job:
    id: "{a5.output.data.id}"
    price: "{a5.output.data.price}"
    approved: true
a7:
  job:
    id: "{a5.output.data.id}"
    price: "{a5.output.data.price}"
    approved: false
```

Update the corresponding workflow so that activities a6 and a7 reference ($ref) the corresponding mapping rules.

# ./src/graphs/order.approval.price.requested.yaml
subscribes: order.approval.price.requested
publishes: order.approval.price.responded

activities:
...
  a6:
    title: Return True
    type: job
    job:
      maps:
        $ref: '../maps/order.approval.price.requested.yaml#/a6/job'
  a7:
    title: Return False
    type: job
    job:
      maps:
        $ref: '../maps/order.approval.price.requested.yaml#/a7/job'
...
```

By defining mapping rules, you can effectively manage the flow of data within your workflows, allowing for seamless data transformations and improved maintainability.