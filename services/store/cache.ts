/**
 * The Cache is a key/value store and used to store commonly accessed Redis metadata
 * (mainly the execution rules for the app) to save time accessing them as they
 * are immutable per verison. The only time the rules are ejected are when
 * a new version is deployed to the quorum and the cache is invalidated/cleared.
 */

import { ActivityType } from "../../typedefs/activity";
import { HookRule } from "../../typedefs/hook";
import { PubSubDBApp, PubSubDBSettings } from "../../typedefs/pubsubdb";
import { Symbols } from "../../typedefs/serializer";
import { Transitions } from "../../typedefs/transition";

class Cache {
  settings: PubSubDBSettings;
  appId: string;
  apps: Record<string, PubSubDBApp>;
  schemas: Record<string, ActivityType>;
  subscriptions: Record<string, Record<string, string>>;
  symbols: Record<string, Symbols>;
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
  constructor(appId: string, settings: PubSubDBSettings, apps: Record<string, PubSubDBApp> = {}, schemas: Record<string, ActivityType> = {}, subscriptions: Record<string, Record<string, string>> = {}, symbols: Record<string, Symbols> = {}, transitions: Record<string, Record<string, unknown>> = {}, hookRules: Record<string, Record<string, HookRule[]>> = {}, workItems: Record<string, string> = {}) {
    this.appId = appId;
    this.settings = settings;
    this.apps = apps;
    this.schemas = schemas;
    this.subscriptions = subscriptions;
    this.symbols = symbols;
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

  getSchemas(appId: string, version: string): Record<string, ActivityType> {
    return this.schemas[`${appId}/${version}`] as unknown as Record<string, ActivityType>;
  }

  getSchema(appId: string, version: string, activityId: string): ActivityType {
    return this.schemas?.[`${appId}/${version}`]?.[activityId] as ActivityType;
  }

  setSchemas(appId: string, version: string, schemas: Record<string, ActivityType>): void {
    this.schemas[`${appId}/${version}`] = schemas as unknown as Record<string, ActivityType>;
  }

  setSchema(appId: string, version: string, activityId: string, schema: ActivityType): void {
    this.schemas[`${appId}/${version}`][activityId] = schema;
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

  getSymbols(appId: string, targetEntityId: string): Symbols {
    return this.symbols[`${appId}/${targetEntityId}`] as Symbols;
  }

  setSymbols(appId: string, targetEntityId: string, symbols: Symbols): void {
    this.symbols[`${appId}/${targetEntityId}`] = symbols;
  }

  deleteSymbols(appId: string, targetEntityId: string): void {
    delete this.symbols[`${appId}/${targetEntityId}`];
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
