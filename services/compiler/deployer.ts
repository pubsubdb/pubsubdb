import { PubSubDBGraph, PubSubDBManifest } from "../../typedefs/pubsubdb";
import { StoreService } from '../store/store';

type JsonObject = { [key: string]: any };

class Deployer {
  manifest: PubSubDBManifest | null = null;
  private store: StoreService | null;

  async deploy(manifest: PubSubDBManifest, store: StoreService) {
    this.manifest = manifest;
    this.store = store;

    this.bindSortedActivityIdsToTriggers();
    this.extractDynamicMappingRules();
    await this.deployHookPatterns();
    await this.deployActivitySchemas();
    await this.deploySubscriptions(); 
    await this.deployTransitions();
    await this.deployPublications();
    await this.publishNewVersionToSubscribers();
    await this.updateActiveVersionInRedis();
    await this.publishActivateCommandToInstances();
  }

  getAppConfig() {
    return {
      id: this.manifest.app.id,
      version: this.manifest.app.version,
    };
  }

  /**
   * 1) Bind the sorted activity IDs to the trigger activity; this is used when the job
   * is invoked to determine which activities are executing. Because this is a graph, we
   * cannot rely on the order of the activities in the manifest file and instead just
   * alphabetically sort the activities by their ID (ascending) ["a1", "a2", "a3", ...]
   * and then bind the sorted array to the trigger activity. This is used by the trigger
   * at runtime to create 15-digit collation integer (99999999999) that can be used to track
   * the status of the job at the level of the individual activity. A collation value of
   * 899000000000000 means that the first activity (assume 'a1') is running and the others
   * are still pending. Remember that this is alphabetical, so it is merely coincidence that
   * the value was `899*` and not `989*` or `998*`.
   */
  bindSortedActivityIdsToTriggers() {
    const graphs = this.manifest.app.graphs;
  
    for (const graph of graphs) {
      const activities = graph.activities;
      const triggerActivityId = this.getTriggerActivityId(graph);
  
      if (triggerActivityId) {
        const activityIds = Object.keys(activities).sort();
        activities[triggerActivityId].sortedActivityIds = activityIds;

        Object.entries(activities).forEach(([activityId, activity]) => {
          activity.sortedActivityPosition = activityIds.indexOf(activityId);
        });
      }
    }
  }
  
  getTriggerActivityId(graph: PubSubDBGraph): string | null {
    const activities = graph.activities;
    for (const activityKey in activities) {
      const activity = activities[activityKey];
      if (activity.type === "trigger") {
        return activityKey;
      }
    }
    return null;
  }

  /**
   * 
   * @returns {string[]} - an array of dynamic mapping rules
   */
  extractDynamicMappingRules(): string[] {
    let dynamicMappingRules: string[] = [];
    //recursive function to descend into the object and find all dynamic mapping rules
    function traverse(obj: JsonObject): void {
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          const stringValue = obj[key] as string;
          const dynamicMappingRuleMatch = stringValue.match(/^\{[^@].*}$/);
          if (dynamicMappingRuleMatch) {
            //NEVER map `input` rules (e.g., {a5.input.data.cat})
            //activities map to job data and ustream activity `output`
            //the one exception is the `trigger` activity, which maps to the `input` provided by the event publisher
            if (stringValue.split('.')[1] !== 'input') {
              dynamicMappingRules.push(stringValue);
            }
          }
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          traverse(obj[key]);
        }
      }
    }
    const graphs = this.manifest.app.graphs;
    for (const graph of graphs) {
      const activities = graph.activities;
      for (const activityId in activities) {
        const activity = activities[activityId];
        traverse(activity);
      }
    }
    dynamicMappingRules = Array.from(new Set(dynamicMappingRules)).sort();
    // Group by the first symbol before the period (this is the activity name)
    const groupedRules: { [key: string]: string[] } = {};
    for (const rule of dynamicMappingRules) {
      const group = rule.substring(1).split('.')[0];
      if (!groupedRules[group]) {
        groupedRules[group] = [];
      }
      groupedRules[group].push(rule);
    }
    // Iterate through the graph and add 'dependents' field to each activity
    for (const graph of graphs) {
      const activities = graph.activities;
      for (const activityId in activities) {
        const activity = activities[activityId];
        activity.dependents = groupedRules[`${activityId}`] || [];
      }
    }
    return dynamicMappingRules;
  }

  /**
   * 2.1) Deploy the activity schemas to Redis
   */
  async deployActivitySchemas() {
    const graphs = this.manifest!.app.graphs;
    const activitySchemas: { [key: string]: string } = {};
    for (const graph of graphs) {
      const activities = graph.activities;
      for (const activityKey in activities) {
        activitySchemas[activityKey] = activities[activityKey];
      }
    }
    await this.store.setSchemas(activitySchemas, this.getAppConfig());
  }

  /**
   * 2.2a) Deploy the public subscriptions to Redis
   */
  async deploySubscriptions() {
    const graphs = this.manifest!.app.graphs;
    const publicSubscriptions: { [key: string]: string } = {};
    for (const graph of graphs) {
      const activities = graph.activities;
      const subscribesTopic = graph.subscribes;
      // Find the activity ID associated with the subscribes topic
      for (const activityKey in activities) {
        if (activities[activityKey].type === 'trigger') {
          publicSubscriptions[subscribesTopic] = activityKey;
          break;
        }
      }
    }
    await this.store.setSubscriptions(publicSubscriptions, this.getAppConfig());
  }

  /**
   * Helper function to find the trigger in a graph
   * @param graph 
   * @returns 
   */
  findTrigger(graph: PubSubDBGraph): [string, any] | null {
    for (const activityKey in graph.activities) {
      const activity = graph.activities[activityKey];
      if (activity.type === 'trigger') {
        return [activityKey, activity];
      }
    }
    return null;
  }

  /**
   * 2.2b) Deploy the private subscriptions to Redis
   */
  async deployTransitions() {
    const graphs = this.manifest!.app.graphs;
    const privateSubscriptions: { [key: string]: any } = {};
  
    for (const graph of graphs) {  
      // Check if graph.subscribes starts with a period (its a private subscription)
      if (graph.subscribes && graph.subscribes.startsWith('.')) {
        const [triggerId] = this.findTrigger(graph);
        if (triggerId) {
          privateSubscriptions[graph.subscribes] = { [triggerId]: true };
        }
      }
      if (graph.transitions) {
        for (const fromActivity in graph.transitions) {
          const toTransitions = graph.transitions[fromActivity];
          const toValues: { [key: string]: any } = {};
          for (const transition of toTransitions) {
            const to = transition.to;
          if (transition.conditions) {
              toValues[to] = transition.conditions;
            } else {
              toValues[to] = true;
            }
          }
          if (Object.keys(toValues).length > 0) {
            privateSubscriptions['.' + fromActivity] = toValues;
          }
        }
      }
    }
    await this.store.setTransitions(privateSubscriptions, this.getAppConfig());
  }

  async deployHookPatterns() {
    const graphs = this.manifest!.app.graphs;
    const hookPatterns: { [key: string]: string } = {};

    for (const graph of graphs) {
      if (graph.hooks) {
        for (const topic in graph.hooks) {
          hookPatterns[topic] = graph.hooks[topic];
          //create back ref in the graph (when schema is saved it will be available)
          const activityId = graph.hooks[topic][0].to;
          const targetActivity = graph.activities[activityId];
          if (targetActivity) {
            if (!targetActivity.hook) {
              targetActivity.hook = {};
            }
            targetActivity.hook.topic = topic;
          }
        }
      }
    }
    //save hooks to redis
    await this.store.setHookPatterns(hookPatterns, this.getAppConfig());
  }

  // 2.3) Compile the list of publications; used for dynamic subscriptions (block if nonexistent)
  async deployPublications() {
    // Implement the method content
  }

  // 2.4) Publish to all subscribers the new version (and to pause for 5ms)
  async publishNewVersionToSubscribers() {
    // Implement the method content
  }

  // 2.5) Update the version number in Redis for the active version
  async updateActiveVersionInRedis() {
    // Implement the method content
  }

  // 2.6) Publish activate command to all instances to clear local caches and start processing the new version
  async publishActivateCommandToInstances() {
    // Implement the method content
  }
}

export { Deployer };
