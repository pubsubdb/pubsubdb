import { PubSubDBManifest } from "../../typedefs/pubsubdb";

class Segmenter {
  manifest: PubSubDBManifest | null = null;

  async segment(manifest: PubSubDBManifest) {
    //call other methods
    this.segmentAndDeployActivities();
    this.compileAndDeploySubscriptions();
    this.compileAndDeploySubscriptionPatterns();
    this.compileAndDeployPublications();
    this.publishNewVersionToSubscribers();
    this.updateActiveVersionInRedis();
    this.publishActivateCommandToInstances();
  }

  // 2.1) Segment each activity definition and deploy segment to Redis
  segmentAndDeployActivities() {
    // Implement the method content
  }

  // 2.2) Compile the list of subscriptions and deploy to Redis
  compileAndDeploySubscriptions() {
    // Implement the method content
  }

  // 2.2) Compile the list of subscription patterns and deploy to Redis
  compileAndDeploySubscriptionPatterns() {
    // Implement the method content
  }

  // 2.3) Compile the list of publications and deploy to Redis
  compileAndDeployPublications() {
    // Implement the method content
  }

  // 2.4) Publish to all subscribers the new version (and to pause for 5ms)
  publishNewVersionToSubscribers() {
    // Implement the method content
  }

  // 2.5) Update the version number in Redis for the active version
  updateActiveVersionInRedis() {
    // Implement the method content
  }

  // 2.6) Publish activate command to all instances to clear local caches and start processing the new version
  publishActivateCommandToInstances() {
    // Implement the method content
  }
}

export { Segmenter };
