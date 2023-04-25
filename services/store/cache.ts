/**
 * The Cache is a key/value store and used to store commonly accessed Redis metadata (namely,
 * the execution rules for the app) to save time accessing the execution rules.
 * 
 * The cache should be regularly cleared every 5 minutes or so...it's not expensive and ensures
 * that the cache is always up-to-date. A Conductor Service should be used to synchronize all
 * running redis clients, so that they all switch versions simultaneously
 * 
 */

import { PubSubDBApp, PubSubDBSettings } from "../../typedefs/pubsubdb";

class Cache {
  settings: PubSubDBSettings;
  appId: string;
  apps: Record<string, PubSubDBApp>;
  schemas: Record<string, Record<string, unknown>>;
  subscriptions: Record<string, Record<string, string>>;
  transitions: Record<string, Record<string, unknown>>;
  hookPatterns: Record<string, Record<string, unknown>>;

  /**
   * The cache is ALWAYS initialized with PubSubDBSettings. The other parameters are optional.
   * @param settings 
   * @param apps 
   * @param schemas 
   * @param subscriptions 
   * @param transitions 
   * @param hookPatterns 
   */
  constructor(appId: string, settings: PubSubDBSettings, apps: Record<string, PubSubDBApp> = {}, schemas: Record<string, Record<string, unknown>> = {}, subscriptions: Record<string, Record<string, string>> = {}, transitions: Record<string, Record<string, unknown>> = {}, hookPatterns: Record<string, Record<string, unknown>> = {}) {
    this.appId = appId;
    this.settings = settings;
    this.apps = apps;
    this.schemas = schemas;
    this.subscriptions = subscriptions;
    this.transitions = transitions;
    this.hookPatterns = hookPatterns;
  }

  /**
   * invalidate the cache; settings are not invalidated!
   */
  invalidate(): void {
    this.apps = {} as Record<string, PubSubDBApp>;
    this.schemas = {};
    this.subscriptions = {};
    this.transitions = {};
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

  getTransitions(appId: string, version: string): Record<string, unknown> {
    return this.transitions[`${appId}/${version}`];
  }

  setTransitions(appId: string, version: string, transitions: Record<string, unknown>): void {
    this.transitions[`${appId}/${version}`] = transitions;
  }

  getHookPatterns(appId: string): Record<string, unknown> {
    return this.hookPatterns[`${appId}`];
  }

  setHookPatterns(appId: string, hookPatterns: Record<string, unknown>): void {
    this.hookPatterns[`${appId}`] = hookPatterns;
  }

  getSignals(appId: string, version: string): Record<string, unknown> {
    throw new Error("SIGNAL (getHooks) is not supported");
  }

  setSignals(appId: string, version: string): Record<string, unknown> {
    throw new Error("SIGNAL (setHook) is not supported");
  }
}

export { Cache };
