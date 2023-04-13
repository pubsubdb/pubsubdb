"use strict";
/**
 * cache is a key/value store and used to front Redis for commonly accessed data
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Cache = void 0;
class Cache {
    /**
     * The cache is ALWAYS initialized with PubSubDBSettings. The other parameters are optional.
     * @param settings
     * @param apps
     * @param schemas
     * @param subscriptions
     * @param transitions
     * @param hookPatterns
     */
    constructor(appId, settings, apps = {}, schemas = {}, subscriptions = {}, transitions = {}, hookPatterns = {}) {
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
    invalidate() {
        this.apps = {};
        this.schemas = {};
        this.subscriptions = {};
        this.transitions = {};
        this.hookPatterns = {};
    }
    getSettings() {
        return this.settings;
    }
    setSettings(settings) {
        this.settings = settings;
    }
    getApps() {
        return this.apps;
    }
    getApp(appId) {
        return this.apps[appId];
    }
    setApps(apps) {
        this.apps = apps;
    }
    setApp(appId, app) {
        this.apps[appId] = app;
    }
    getSchemas(appId, version) {
        return this.schemas[`${appId}/${version}`];
    }
    getSchema(appId, version, activityId) {
        return this.schemas?.[`${appId}/${version}`]?.[activityId];
    }
    setSchemas(appId, version, schemas) {
        this.schemas[`${appId}/${version}`] = schemas;
    }
    setSchema(appId, version, topic, schema) {
        this.schemas[`${appId}/${version}`][topic] = schema;
    }
    getSubscriptions(appId, version) {
        return this.subscriptions[`${appId}/${version}`];
    }
    getSubscription(appId, version, topic) {
        return this.subscriptions?.[`${appId}/${version}`]?.[topic];
    }
    setSubscriptions(appId, version, subscriptions) {
        this.subscriptions[`${appId}/${version}`] = subscriptions;
    }
    getTransitions(appId, version) {
        return this.transitions[`${appId}/${version}`];
    }
    setTransitions(appId, version, transitions) {
        this.transitions[`${appId}/${version}`] = transitions;
    }
    getHookPatterns(appId) {
        return this.hookPatterns[`${appId}`];
    }
    setHookPatterns(appId, hookPatterns) {
        this.hookPatterns[`${appId}`] = hookPatterns;
    }
    getSignals(appId, version) {
        throw new Error("SIGNAL (getHooks) is not supported");
    }
    setSignals(appId, version) {
        throw new Error("SIGNAL (setHook) is not supported");
    }
}
exports.Cache = Cache;
