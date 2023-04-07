import { PubSubDBManifest } from "../../typedefs/pubsubdb";
import { StoreService } from '../store/store';

class Segmenter {
  manifest: PubSubDBManifest | null = null;
  private store: StoreService | null;

  async segment(manifest: PubSubDBManifest, store: StoreService) {
    this.manifest = manifest;
    this.store = store;

    this.deployActivitySchemas();
    this.deploySubscriptions();
    this.deploySubscriptionPatterns();
    this.deployPublications();
    this.publishNewVersionToSubscribers();
    this.updateActiveVersionInRedis();
    this.publishActivateCommandToInstances();
  }

  // 2.1) Segment each activity definition and deploy segment to Redis
  async deployActivitySchemas() {
    const graphs = this.manifest!.app.graphs;
    const activitySchemas: { [key: string]: string } = {};
    for (const graph of graphs) {
      const activities = graph.activities;
      for (const activityKey in activities) {
        activitySchemas[activityKey] = activities[activityKey];
      }
    }
    await this.store.setSchemas(activitySchemas);
  }

  // 2.2) Compile the list of subscriptions and deploy to Redis
  async deploySubscriptions() {
    //public subscriptions should be stored in a hash table
    //the key i
  }

  // 2.2a) Compile the list of subscriptions and deploy to Redis
  async deployPublicSubscriptions() {
    //easy list of top-level subscriptions; store in hash;
    //item id is the 
  }

  // 2.2b) Compile the list of subscriptions and deploy to Redis
  async deployPrivateSubscriptions() {
    //these are subscriptions to .a1, .a5, etc
    //these are stored in a hash table like other subscriptions;
    //but these also need subscription patterns
  }

  // 2.2) Compile the list of subscription patterns and deploy to Redis
  async deploySubscriptionPatterns() {
    // Implement the method content
  }

  // 2.3) Compile the list of publications and deploy to Redis
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

export { Segmenter };
