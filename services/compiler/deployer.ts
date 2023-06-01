import { ActivityType } from "../../typedefs/activity";
import { HookRule } from "../../typedefs/hook";
import { PubSubDBGraph, PubSubDBManifest } from "../../typedefs/pubsubdb";
import { RedisClient, RedisMulti } from "../../typedefs/redis";
import { CollatorService } from "../collator";
import { StoreService } from '../store';

type JsonObject = { [key: string]: any };

class Deployer {
  manifest: PubSubDBManifest | null = null;
  store: StoreService<RedisClient, RedisMulti> | null;

  constructor(manifest: PubSubDBManifest) {
    this.manifest = manifest;
  }

  async deploy(store: StoreService<RedisClient, RedisMulti>) {
    this.store = store;
    //external compilation services (collator, etc)
    CollatorService.compile(this.manifest.app.graphs);

    //local compilation services
    this.copyJobSchemas();
    this.copyPublishTopics();
    this.resolveMappingDependencies();
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
   * job schemas are copied to the trigger activity, as the trigger
   * is a standin for the overall job. this lets users model things
   * intuitively, but lets the system optimize around this conflation.
   */
  copyJobSchemas() {
    const graphs = this.manifest!.app.graphs;
    for (const graph of graphs) {
      const jobSchema = graph.output?.schema;
      const outputSchema = graph.input?.schema;
      if (!jobSchema && !outputSchema) continue;
      const activities = graph.activities;
      // Find the trigger activity and bind the job schema to it
      // at execution time, the trigger is a standin for the job
      for (const activityKey in activities) {
        if (activities[activityKey].type === 'trigger') {
          const trigger = activities[activityKey];
          if (jobSchema) {
            //possible for trigger to have job mappings
            if (!trigger.job) { trigger.job = {}; }
            trigger.job.schema = jobSchema;
          }
          if (outputSchema) {
            //impossible for trigger to have output mappings.
            trigger.output = { schema: outputSchema };
          }
        }
      }
    }
  }

  //makes runtime subscription lookups faster by copying the schemas
  copyPublishTopics() {
    for (const graph of this.manifest!.app.graphs) {
      const activities = graph.activities;
      for (const activityKey in activities) {
        if (graph.publishes) {
          activities[activityKey].publishes = graph.publishes;
        }
      }
    }
  }

  resolveMappingDependencies() {
    const dynamicMappingRules: string[] = [];
    //recursive function to descend into the object and find all dynamic mapping rules
    function traverse(obj: JsonObject, depends: string[]): void {
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          const stringValue = obj[key] as string;
          const dynamicMappingRuleMatch = stringValue.match(/^\{[^@].*}$/);
          if (dynamicMappingRuleMatch) {
            //For now...do not map `input` rules (e.g., {a5.input.data.cat})
            //however, this is likely an unnecessary constraint 
            if (stringValue.split('.')[1] !== 'input') {
              dynamicMappingRules.push(stringValue);
              depends.push(stringValue);
            }
          }
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          traverse(obj[key], depends);
        }
      }
    }
    const graphs = this.manifest.app.graphs;
    for (const graph of graphs) {
      const activities = graph.activities;
      for (const activityId in activities) {
        const activity = activities[activityId];
        activity.depends = [];
        traverse(activity, activity.depends);
        activity.depends = this.groupMappingRules(graphs, activity.depends);
      }
    }
    const groupedRules = this.groupMappingRules(graphs, dynamicMappingRules);
    // Iterate through the graph and add 'dependents' field to each activity
    for (const graph of graphs) {
      const activities = graph.activities;
      for (const activityId in activities) {
        const activity = activities[activityId];
        activity.dependents = groupedRules[`${activityId}`] || [];
      }
    }
  }

  groupMappingRules(graphs, rules: string[]): Record<string, string[]> {
    rules = Array.from(new Set(rules)).sort();
    // Group by the first symbol before the period (this is the activity name)
    const groupedRules: { [key: string]: string[] } = {};
    for (const rule of rules) {
      const [group, resolved] = this.resolveMappableValue(rule);
      if (!groupedRules[group]) {
        groupedRules[group] = [];
      }
      groupedRules[group].push(resolved);
    }
    return groupedRules;
  }

  /**
   * Resolves a mappable value to a group and path. For example, given
   * the value "{a5.output.data.cat}", the resolved group would be "a5"
   * and the path would be "d/cat". At runtime the context can be efficiently
   * generated by using multi with hgetall to restore deeply nested job
   * context while avoiding any unnecessary data transfer. In general, when
   * an activity runs, its context is restored by looking at the data it will need
   * to execute its mapping rules. It then saves just those fields that downstream
   * activities might eventually request given their mapping rules. This mechanism
   * ensures that no data is saved that is not needed by downstream activities. And
   * no data is requested that is not needed for the current activity.
   */
  resolveMappableValue(mappable: string): [string, string] {
    mappable = mappable.substring(1, mappable.length - 1);
    const [group, type, subtype, ...path] = mappable.split('.');
    const prefix = {
      hook: 'h',
      input: 'i',
      output: subtype === 'data' ? 'd': 'm'
    }[type];
    return [group, `${prefix}/${path.join('/')}`];
  }

  async deployActivitySchemas() {
    const graphs = this.manifest!.app.graphs;
    const activitySchemas: Record<string, ActivityType> = {};
    for (const graph of graphs) {
      const activities = graph.activities;
      for (const activityKey in activities) {
        activitySchemas[activityKey] = activities[activityKey];
      }
    }
    await this.store.setSchemas(activitySchemas, this.getAppConfig());
  }

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

  findTrigger(graph: PubSubDBGraph): [string, any] | null {
    for (const activityKey in graph.activities) {
      const activity = graph.activities[activityKey];
      if (activity.type === 'trigger') {
        return [activityKey, activity];
      }
    }
    return null;
  }

  async deployTransitions() {
    const graphs = this.manifest!.app.graphs;
    const privateSubscriptions: { [key: string]: any } = {};
    for (const graph of graphs) {  
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
    const hookRules: Record<string, HookRule[]> = {};
    for (const graph of graphs) {
      if (graph.hooks) {
        for (const topic in graph.hooks) {
          hookRules[topic] = graph.hooks[topic];
          const activityId = graph.hooks[topic][0].to;
          const targetActivity = graph.activities[activityId];
          if (targetActivity) {
            if (!targetActivity.hook) {
              targetActivity.hook = {};
            }
            //create back-reference to the hook topic
            targetActivity.hook.topic = topic;
          }
        }
      }
    }
    await this.store.setHookRules(hookRules, this.getAppConfig());
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
