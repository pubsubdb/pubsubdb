/**
 * The Cache is a key/value store and used to store commonly accessed Redis metadata (namely,
 * the execution rules for the app) to save time accessing the execution rules.
 * 
 * The cache should be regularly cleared every 5 minutes or so...it's not expensive and ensures
 * that the cache is always up-to-date. A Conductor Service should be used to synchronize all
 * running redis clients, so that they all switch versions simultaneously
 * 
 */

import { HookRule } from "../../typedefs/hook";
import { PubSubDBApp, PubSubDBSettings } from "../../typedefs/pubsubdb";
import { Transitions } from "../../typedefs/transition";

class Cache {
  settings: PubSubDBSettings;
  appId: string;
  apps: Record<string, PubSubDBApp>;
  schemas: Record<string, Record<string, unknown>>;
  subscriptions: Record<string, Record<string, string>>;
  transitions: Record<string, Record<string, unknown>>;
  hookRules: Record<string, Record<string, HookRule[]>>;
  workItems: Record<string, string>;

  /**
   * The cache is ALWAYS initialized with PubSubDBSettings. The other parameters are optional.
   * @param settings 
   * @param apps 
   * @param schemas 
   * @param subscriptions 
   * @param transitions 
   * @param hookRules 
   */
  constructor(appId: string, settings: PubSubDBSettings, apps: Record<string, PubSubDBApp> = {}, schemas: Record<string, Record<string, unknown>> = {}, subscriptions: Record<string, Record<string, string>> = {}, transitions: Record<string, Record<string, unknown>> = {}, hookRules: Record<string, Record<string, HookRule[]>> = {}, workItems: Record<string, string> = {}) {
    this.appId = appId;
    this.settings = settings;
    this.apps = apps;
    this.schemas = schemas;
    this.subscriptions = subscriptions;
    this.transitions = transitions;
    this.hookRules = hookRules;
    this.workItems = workItems;
  }

  /**
   * invalidate the cache; settings are not invalidated!
   */
  invalidate(): void {
    this.apps = {} as Record<string, PubSubDBApp>;
    this.schemas = {};
    this.subscriptions = {};
    this.transitions = {};
    this.hookRules = {};
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

  getTransitions(appId: string, version: string): Transitions {
    return this.transitions[`${appId}/${version}`] as Transitions;
  }

  setTransitions(appId: string, version: string, transitions: Transitions): void {
    this.transitions[`${appId}/${version}`] = transitions;
  }

  getHookRules(appId: string): Record<string, HookRule[]> {
    return this.hookRules[`${appId}`];
  }

  setHookRules(appId: string, hookRules: Record<string, HookRule[]>): void {
    this.hookRules[`${appId}`] = hookRules;
  }

  getSignals(appId: string, version: string): Record<string, unknown> {
    throw new Error("SIGNAL (getHooks) is not supported");
  }

  setSignals(appId: string, version: string): Record<string, unknown> {
    throw new Error("SIGNAL (setHook) is not supported");
  }

  getActiveTaskQueue(appId: string): string {
    return this.workItems[appId];
  }

  setWorkItem(appId: string, workItem: string): void {
    this.workItems[appId] = workItem;
  }

  removeWorkItem(appId: string): void {
    delete this.workItems[appId];
  }
}

export { Cache };
