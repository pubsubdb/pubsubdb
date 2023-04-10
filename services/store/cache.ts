/**
 * cache is a key/value store and used to front Redis for commonly accessed data
 */

import { PubSubDBApp, PubSubDBSettings } from "../../typedefs/pubsubdb";

class Cache {
  settings: PubSubDBSettings;
  appId: string;
  apps: Record<string, PubSubDBApp>;
  schemas: Record<string, Record<string, unknown>>;
  subscriptions: Record<string, Record<string, string>>;
  subscriptionPatterns: Record<string, Record<string, unknown>>;
  hookPatterns: Record<string, Record<string, unknown>>;

  /**
   * The cache is ALWAYS initialized with PubSubDBSettings. The other parameters are optional.
   * @param settings 
   * @param apps 
   * @param schemas 
   * @param subscriptions 
   * @param subscriptionPatterns 
   * @param hookPatterns 
   */
  constructor(appId: string, settings: PubSubDBSettings, apps: Record<string, PubSubDBApp> = {}, schemas: Record<string, Record<string, unknown>> = {}, subscriptions: Record<string, Record<string, string>> = {}, subscriptionPatterns: Record<string, Record<string, unknown>> = {}, hookPatterns: Record<string, Record<string, unknown>> = {}) {
    this.appId = appId;
    this.settings = settings;
    this.apps = apps;
    this.schemas = schemas;
    this.subscriptions = subscriptions;
    this.subscriptionPatterns = subscriptionPatterns;
    this.hookPatterns = hookPatterns;
  }

  /**
   * invalidate the cache; settings are not invalidated!
   */
  invalidate(): void {
    this.apps = {} as Record<string, PubSubDBApp>;
    this.schemas = {};
    this.subscriptions = {};
    this.subscriptionPatterns = {};
    this.hookPatterns = {};
  }

  getSettings(): PubSubDBSettings {
    return this.settings;
  }

  setSettings(settings: PubSubDBSettings): void {
    this.settings = settings;
  }

  getApps(): Record<string, PubSubDBApp> {
    return this.apps;
  }

  getApp(appId: string): PubSubDBApp {
    return this.apps[appId] as PubSubDBApp;
  }

  setApps(apps: Record<string, PubSubDBApp>): void {
    this.apps = apps;
  }

  setApp(appId: string, app: PubSubDBApp): void {
    this.apps[appId] = app;
  }

  getSchemas(appId: string, version: string): Record<string, unknown> {
    return this.schemas[`${appId}/${version}`];
  }

  getSchema(appId: string, version: string, activityId: string): unknown {
    return this.schemas?.[`${appId}/${version}`]?.[activityId];
  }

  setSchemas(appId: string, version: string, schemas: Record<string, unknown>): void {
    this.schemas[`${appId}/${version}`] = schemas;
  }

  setSchema(appId: string, version: string, topic: string, schema: Record<string, unknown>): void {
    this.schemas[`${appId}/${version}`][topic] = schema;
  }

  getSubscriptions(appId: string, version: string): Record<string, string> {
    return this.subscriptions[`${appId}/${version}`];
  }

  getSubscription(appId: string, version: string, topic: string): unknown {
    return this.subscriptions?.[`${appId}/${version}`]?.[topic];
  }

  setSubscriptions(appId: string, version: string, subscriptions: Record<string, string>): void {
    this.subscriptions[`${appId}/${version}`] = subscriptions;
  }

  getSubscriptionPatterns(appId: string, version: string): Record<string, unknown> {
    return this.subscriptionPatterns[`${appId}/${version}`];
  }

  setSubscriptionPatterns(appId: string, version: string, subscriptionPatterns: Record<string, unknown>): void {
    this.subscriptionPatterns[`${appId}/${version}`] = subscriptionPatterns;
  }

  getHooks(appId: string, version: string): Record<string, unknown> {
    throw new Error("Hooks (getHooks) is not supported");
  }

  setHook(appId: string, version: string): Record<string, unknown> {
    //NOTE: setting hook is only done at runtime, not compile time
    //      hooks are not cached or ever really read as a set
    throw new Error("Hooks (setHook) is not supported");
  }

  getHookPatterns(appId: string, version: string): Record<string, unknown> {
    //NOTE: hook patterns ARE cached locally
    throw new Error("Hooks (getHookPatterns) is not supported");
  }

  getHookPattern(appId: string, version: string): Record<string, unknown> {
    //a single hook pattern is not cached locally
    throw new Error("Hooks (getHookPattern) is not supported");
  }

  setHookPatterns(appId: string, version: string, hookPatterns: Record<string, unknown>): void {
    //hook patterns are set as a single set at compile time
    throw new Error("Hooks (setHookPatterns) is not supported");
  }
}

export { Cache };
