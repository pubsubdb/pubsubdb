import { CollatorService } from "../collator";
import { StoreService } from '../store';
import { ActivityType } from "../../typedefs/activity";
import { HookRule } from "../../typedefs/hook";
import { PubSubDBGraph, PubSubDBManifest } from "../../typedefs/pubsubdb";
import { RedisClient, RedisMulti } from "../../typedefs/redis";
import { MultiDimensionalDocument, Symbols } from "../../typedefs/serializer";
import { numberToSequence } from "../../modules/utils";

const DEFAULT_METADATA_RANGE_SIZE = 26; //metadata is 26 slots ([a-z] * 1)
const DEFAULT_DATA_RANGE_SIZE = 260; //data is 260 slots ([a-zA-Z] * 5)
const DEFAULT_RANGE_SIZE = DEFAULT_METADATA_RANGE_SIZE + DEFAULT_DATA_RANGE_SIZE;

class Deployer {
  manifest: PubSubDBManifest | null = null;
  store: StoreService<RedisClient, RedisMulti> | null;

  constructor(manifest: PubSubDBManifest) {
    this.manifest = manifest;
  }

  async deploy(store: StoreService<RedisClient, RedisMulti>) {
    this.store = store;
    CollatorService.compile(this.manifest.app.graphs);
    this.copyJobSchemas();
    this.bindBackRefs();
    this.resolveMappingDependencies(); //legacy (activity data maps)
    this.resolveJobMapsPaths();        //new (job data maps)
    this.resolveDataDependencies();    //new (activity data maps)
    await this.generateSymbols();      //new (map paths => symbols)
    await this.deployHookPatterns();
    await this.deployActivitySchemas();
    await this.deploySubscriptions(); 
    await this.deployTransitions();
  }

  getVID() {
    return {
      id: this.manifest.app.id,
      version: this.manifest.app.version,
    }
  }

  async generateSymbols() {
    //note: symbol ranges are additive (per version); path assignments are immutable
    const appId = this.manifest.app.id;
    for (const graph of this.manifest.app.graphs) {
      //generate JOB symbols
      const [,trigger] = this.findTrigger(graph);
      const topic = trigger.subscribes;
      const [lower, upper, symbols] = await this.store.reserveSymbolRange(`$${topic}`, appId, DEFAULT_RANGE_SIZE, 'JOB');
      const prefix = ''; //job meta/data is NOT namespaced
      const newSymbols = this.bindSymbols(lower, upper, symbols, prefix, trigger.PRODUCES);
      if (Object.keys(newSymbols).length) {
        await this.store.addSymbols(`$${topic}`, appId, newSymbols);
      }
      //generate ACTIVITY symbols
      for (const [activityId, activity] of Object.entries(graph.activities)) {
        const [lower, upper, symbols] = await this.store.reserveSymbolRange(activityId, appId, DEFAULT_RANGE_SIZE, 'ACTIVITY');
        const prefix = `${activityId}/`; //activity meta/data is namespaced
        const newSymbols = this.bindSymbols(lower, upper, symbols, prefix, activity.produces);
        if (Object.keys(newSymbols).length) {
          await this.store.addSymbols(activityId, appId, newSymbols);
        }
      }
    }
  }

  bindSymbols(startIndex: number, maxIndex: number, existingSymbols: Symbols, prefix: string, produces: string[]): Symbols {
    let newSymbols: Symbols = {};
    let currentSymbols: Symbols = {...existingSymbols};
    for (let path of produces) {
      const fullPath = `${prefix}${path}`;
      if (!currentSymbols[fullPath]) {
        if (startIndex > maxIndex) {
          throw new Error('Symbol index out of bounds');
        }
        const symbol = numberToSequence(startIndex);
        startIndex++
        newSymbols[fullPath] = symbol;
        currentSymbols[fullPath] = symbol; // update the currentSymbols to include this new symbol
      }
    }
    return newSymbols;
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

  bindBackRefs() {
    for (const graph of this.manifest!.app.graphs) {
      const activities = graph.activities;
      const triggerId = this.findTrigger(graph)[0];
      for (const activityKey in activities) {
        activities[activityKey].trigger = triggerId;
        activities[activityKey].subscribes = graph.subscribes;
        if (graph.publishes) {
          activities[activityKey].publishes = graph.publishes;
        }
      }
    }
  }

  resolveJobMapsPaths() {
    function parsePaths(obj: MultiDimensionalDocument): string[] {
      let result = [];
      function traverse(obj: MultiDimensionalDocument, path = []) {
        for (let key in obj) {
          if (typeof obj[key] === 'object' && obj[key] !== null) {
            let newPath = [...path, key];
            traverse(obj[key], newPath);
          } else {
            const finalPath = `data/${[...path, key].join('/')}`;
            if (!result.includes(finalPath)) {
              result.push(finalPath);
            }
          }
        }
      }
      if (obj) {
        traverse(obj);
      }
      return result;
    }
  
    for (const graph of this.manifest.app.graphs) {
      let results: string[] = [];
      const [, trigger] = this.findTrigger(graph);
      for (const activityKey in graph.activities) {
        const activity = graph.activities[activityKey];
        results = results.concat(parsePaths(activity.job?.maps));
      }
      trigger.PRODUCES = results;
    }
  }
  
  resolveMappingDependencies() {
    const dynamicMappingRules: string[] = [];
    //recursive function to descend into the object and find all dynamic mapping rules
    function traverse(obj: MultiDimensionalDocument, depends: string[]): void {
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          const stringValue = obj[key] as string;
          const dynamicMappingRuleMatch = stringValue.match(/^\{[^@].*}$/);
          if (dynamicMappingRuleMatch) { 
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
        activity.depends = this.groupMappingRules(activity.depends);
      }
    }
    const groupedRules = this.groupMappingRules(dynamicMappingRules);
    // Iterate through the graph and add 'dependents' field to each activity
    for (const graph of graphs) {
      const activities = graph.activities;
      for (const activityId in activities) {
        const activity = activities[activityId];
        activity.dependents = groupedRules[`${activityId}`] || [];
      }
    }
  }

  groupMappingRules(rules: string[]): Record<string, string[]> {
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

  //single-file unified data format
  resolveDataDependencies() {
    for (const graph of this.manifest!.app.graphs) {
      for (const activity of Object.values(graph.activities)) {
        this.transformObject(activity);
      }
    }
  }

  transformObject(activity: ActivityType): void {
    const replacements = { 'd/': 'output/data/', 'm/': 'input/metadata/', 'h/': 'hook/data/', 'i/': 'input/data/' };
    function replaceInArray(array: string[]): string[] {
      return array.map(item => {
        for (const key in replacements) {
          if (item.startsWith(key)) {
            return item.replace(key, replacements[key]);
          }
        }
        return item;
      });
    }
    function transformEntry(entry: Record<string, string[]>): any {
      let result: any = {};
      for (const key in entry) {
        result[key] = replaceInArray(entry[key]);
      }
      return result;
    }
    if (activity.depends) {
      activity.consumes = transformEntry(activity.depends);
    }
    if (activity.dependents) {
      activity.produces = replaceInArray(activity.dependents);
    }
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
    await this.store.setSchemas(activitySchemas, this.getVID());
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
    await this.store.setSubscriptions(publicSubscriptions, this.getVID());
  }

  findTrigger(graph: PubSubDBGraph): [string, Record<string, any>] | null {
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
    await this.store.setTransitions(privateSubscriptions, this.getVID());
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
    await this.store.setHookRules(hookRules);
  }
}

export { Deployer };
