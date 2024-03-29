import { KeyStoreParams, KeyType } from "../../modules/key";
import { getSymKey } from "../../modules/utils";
import { CollatorService } from "../collator";
import { SerializerService } from "../serializer";
import { StoreService } from '../store';
import { ActivityType } from "../../types/activity";
import { HookRule } from "../../types/hook";
import { PubSubDBGraph, PubSubDBManifest } from "../../types/pubsubdb";
import { RedisClient, RedisMulti } from "../../types/redis";
import { StringAnyType, Symbols } from "../../types/serializer";

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
    this.convertTopicsToTypes();
    this.copyJobSchemas();
    this.bindBackRefs();
    this.bindParents();
    this.resolveMappingDependencies();
    this.resolveJobMapsPaths();
    await this.generateSymKeys();
    await this.generateSymVals();
    await this.deployHookPatterns();
    await this.deployActivitySchemas();
    await this.deploySubscriptions(); 
    await this.deployTransitions();
    await this.deployConsumerGroups();
  }

  getVID() {
    return {
      id: this.manifest.app.id,
      version: this.manifest.app.version,
    }
  }

  async generateSymKeys() {
    //note: symbol ranges are additive (per version); path assignments are immutable
    const appId = this.manifest.app.id;
    for (const graph of this.manifest.app.graphs) {
      //generate JOB symbols
      const [,trigger] = this.findTrigger(graph);
      const topic = trigger.subscribes;
      const [lower, upper, symbols] = await this.store.reserveSymbolRange(`$${topic}`, DEFAULT_RANGE_SIZE, 'JOB');
      const prefix = ''; //job meta/data is NOT namespaced
      const newSymbols = this.bindSymbols(lower, upper, symbols, prefix, trigger.PRODUCES);
      if (Object.keys(newSymbols).length) {
        await this.store.addSymbols(`$${topic}`, newSymbols);
      }
      //generate ACTIVITY symbols
      for (const [activityId, activity] of Object.entries(graph.activities)) {
        const [lower, upper, symbols] = await this.store.reserveSymbolRange(activityId, DEFAULT_RANGE_SIZE, 'ACTIVITY');
        const prefix = `${activityId}/`; //activity meta/data is namespaced
        const newSymbols = this.bindSymbols(lower, upper, symbols, prefix, activity.produces);
        if (Object.keys(newSymbols).length) {
          await this.store.addSymbols(activityId, newSymbols);
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
        const symbol = getSymKey(startIndex);
        startIndex++
        newSymbols[fullPath] = symbol;
        currentSymbols[fullPath] = symbol; // update the currentSymbols to include this new symbol
      }
    }
    return newSymbols;
  }

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
        if (graph.expire) {
          activities[activityKey].expire = graph.expire;
        }
      }
    }
  }

  //more intuitive for SDK users to use 'topic',
  //but the compiler is desiged to be generic and uses 'subtypes'
  convertTopicsToTypes() {
    for (const graph of this.manifest!.app.graphs) {
      const activities = graph.activities;
      for (const activityKey in activities) {
        const activity = activities[activityKey];
        if (['worker', 'await'].includes(activity.type) && activity.topic && !activity.subtype) {
          activity.subtype = activity.topic;
        }
      }
    }
  }

  async bindParents() {
    const graphs = this.manifest.app.graphs;
    for (const graph of graphs) {  
      if (graph.transitions) {
        for (const fromActivity in graph.transitions) {
          const toTransitions = graph.transitions[fromActivity];
          for (const transition of toTransitions) {
            const to = transition.to;
            //DAGs have one parent; easy to optimize for
            graph.activities[to].parent = fromActivity;
          }
        }
      }
    }
  }

  collectValues(schema: Record<string, any>, values: Set<string>) {
    for (const [key, value] of Object.entries(schema)) {
      if (key === 'enum' || key === 'examples' || key === 'default') {
        if (Array.isArray(value)) {
          for (const v of value) {
            if (typeof v === 'string' && v.length > 5) {
              values.add(v);
            }
          }
        } else if (typeof value === 'string' && value.length > 5) {
          values.add(value);
        }
      } else if (typeof value === 'object') {
        this.collectValues(value, values);
      }
    }
  }
  
  traverse(obj: any, values: Set<string>) {
    for (const value of Object.values(obj)) {
      if (typeof value === 'object') {
        if ('schema' in value) {
          this.collectValues(value.schema, values);
        } else {
          this.traverse(value, values);
        }
      }
    }
  }
  
  async generateSymVals() {
    const uniqueStrings = new Set<string>();
    for (const graph of this.manifest!.app.graphs) {
      this.traverse(graph, uniqueStrings);
    }
    const existingSymbols = await this.store.getSymbolValues();
    const startIndex = Object.keys(existingSymbols).length;
    const maxIndex = Math.pow(52, 2) - 1;
    const newSymbols = SerializerService.filterSymVals(startIndex, maxIndex, existingSymbols, uniqueStrings);
    await this.store.addSymbolValues(newSymbols);
  }

  resolveJobMapsPaths() {
    function parsePaths(obj: StringAnyType): string[] {
      let result = [];
      function traverse(obj: StringAnyType, path = []) {
        for (let key in obj) {
          if (typeof obj[key] === 'object' && obj[key] !== null && !('@pipe' in obj[key])) {
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
    function traverse(obj: StringAnyType, consumes: string[]): void {
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          const stringValue = obj[key] as string;
          const dynamicMappingRuleMatch = stringValue.match(/^\{[^@].*}$/);
          if (dynamicMappingRuleMatch) { 
            if (stringValue.split('.')[1] !== 'input') {
              dynamicMappingRules.push(stringValue);
              consumes.push(stringValue);
            }
          }
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          traverse(obj[key], consumes);
        }
      }
    }
    const graphs = this.manifest.app.graphs;
    for (const graph of graphs) {
      const activities = graph.activities;
      for (const activityId in activities) {
        const activity = activities[activityId];
        activity.consumes = [];
        traverse(activity, activity.consumes);
        activity.consumes = this.groupMappingRules(activity.consumes);
      }
    }
    const groupedRules = this.groupMappingRules(dynamicMappingRules);
    // Iterate through the graph and add 'produces' field to each activity
    for (const graph of graphs) {
      const activities = graph.activities;
      for (const activityId in activities) {
        const activity = activities[activityId];
        activity.produces = groupedRules[`${activityId}`] || [];
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

  resolveMappableValue(mappable: string): [string, string] {
    mappable = mappable.substring(1, mappable.length - 1);
    const parts = mappable.split('.');
    if (parts[0] === '$job') {
      const [group, ...path] = parts;
      return [group, path.join('/')];
    } else {
      //normalize paths to be relative to the activity
      const [group, type, subtype, ...path] = parts;
      const prefix = {
        hook: 'hook/data',
        input: 'input/data',
        output: subtype === 'data' ? 'output/data': 'output/metadata'
      }[type];
      return [group, `${prefix}/${path.join('/')}`];
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

  async deployConsumerGroups() {
    //create one engine group
    const params: KeyStoreParams = { appId: this.manifest.app.id }
    const key = this.store.mintKey(KeyType.STREAMS, params);
    await this.deployConsumerGroup(key, 'ENGINE');
    for (const graph of this.manifest.app.graphs) {
      const activities = graph.activities;
      for (const activityKey in activities) {
        const activity = activities[activityKey];
        if (activity.type === 'worker') {
          params.topic = activity.subtype;
          const key = this.store.mintKey(KeyType.STREAMS, params);
          //create one worker group per unique activity subtype (the topic)
          await this.deployConsumerGroup(key, 'WORKER');
        }
      }
    }
  }

  async deployConsumerGroup(stream: string, group: string) {
    try {
      await this.store.xgroup('CREATE', stream, group, '$', 'MKSTREAM');
    } catch (err) {
      this.store.logger.info('consumer-group-exists', { stream, group });
    }
  }
}

export { Deployer };
