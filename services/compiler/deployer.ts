import { PubSubDBGraph, PubSubDBManifest } from "../../typedefs/pubsubdb";
import { StoreService } from '../store/store';

class Deployer {
  manifest: PubSubDBManifest | null = null;
  private store: StoreService | null;

  async deploy(manifest: PubSubDBManifest, store: StoreService) {
    this.manifest = manifest;
    this.store = store;

    await this.deployActivitySchemas();
    await this.deploySubscriptions(); 
    await this.deploySubscriptionPatterns();
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
  async deploySubscriptionPatterns() {
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
    await this.store.setSubscriptionPatterns(privateSubscriptions, this.getAppConfig());
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
