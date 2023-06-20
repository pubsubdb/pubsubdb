import {
  KeyService,
  KeyStoreParams,
  KeyType, 
  PSNS} from '../../modules/key';
import { ILogger } from '../logger';
import { MDATA_SYMBOLS, SerializerService as Serializer } from '../serializer';
import { Cache } from './cache';
import { ActivityType,  Consumes} from '../../typedefs/activity';
import { AppVID } from '../../typedefs/app';
import {
  HookRule,
  HookSignal } from '../../typedefs/hook';
import {
  PubSubDBApp,
  PubSubDBApps,
  PubSubDBSettings } from '../../typedefs/pubsubdb';
import {
  AbbreviationObjects,
  FlatDocument,
  MultiDimensionalDocument,
  Symbols } from '../../typedefs/serializer';
import {
  IdsData,
  JobStats,
  JobStatsRange,
  StatsType } from '../../typedefs/stats';
import { Transitions } from '../../typedefs/transition';
import { numberToSequence } from '../../modules/utils';

interface AbstractRedisClient {
  exec(): any;
}

abstract class StoreService<T, U extends AbstractRedisClient> {
  redisClient: T;
  cache: Cache;
  serializer: Serializer;
  namespace: string;
  appId: string
  logger: ILogger;
  commands: Record<string, string>;


  //todo: standardize signatures and move concrete methods to this class
  abstract getMulti(): U;
  abstract publish(
    keyType: KeyType.QUORUM,
    message: Record<string, any>,
    appId: string,
    engineId?: string
  ): Promise<boolean>;
  abstract xgroup(
    command: 'CREATE',
    key: string,
    groupName: string,
    id: string,
    mkStream?: 'MKSTREAM'
  ): Promise<boolean>;
  abstract xadd(
    key: string,
    id: string,
    ...args: string[]
  ): Promise<string>;
  abstract xpending(
    key: string,
    group: string,
    start?: string,
    end?: string,
    count?: number,
    consumer?: string): Promise<[string, string, number, [string, number][]][] | [string, string, number, number] | unknown[]>;
  abstract xclaim(
    key: string,
    group: string,
    consumer: string,
    minIdleTime: number,
    id: string,
    ...args: string[]): Promise<[string, string][] | unknown[]>;
  abstract xack(
    key: string,
    group: string,
    id: string,
    multi?: U
  ): Promise<number|U>;
  abstract xdel(
    key: string,
    id: string,
    multi?: U
  ): Promise<number|U>;

  constructor(redisClient: T) {
    this.redisClient = redisClient;
    //default command set uses 'redis' NPM Package format
    this.commands = {
      hset: 'hset',
      hsetnx: 'hsetnx',
      hincrby: 'hincrby',
      hdel: 'hdel',
      hget: 'hget',
      hmget: 'hmget',
      hgetall: 'hgetall',
      hincrbyfloat: 'hincrbyfloat',
      zrange: 'zrange',
      zrem: 'zrem',
      zadd: 'zadd',
      lmove: 'lmove',
      lrange: 'lrange',
      rename: 'rename',
      rpush: 'rpush',
      xack: 'xack',
      xdel: 'xdel',
    };
  }

  async init(namespace = PSNS, appId: string, logger: ILogger): Promise<PubSubDBApps> {
    this.namespace = namespace;
    this.appId = appId;
    this.logger = logger;
    const settings = await this.getSettings(true);
    this.cache = new Cache(appId, settings);
    this.serializer = new Serializer();
    await this.getApp(appId);
    return this.cache.getApps();
  }

  isSuccessful(result: any): boolean {
    return result === 1 || result === 'OK' || result === true;
  }

  zAdd(key: string, score: number | string, value: string | number, redisMulti: U): Promise<any> {
    //default call signature uses 'redis' NPM Package format
    return redisMulti[this.commands.zadd](key, { score: score, value: value.toString() } as any);
  }

  mintKey(type: KeyType, params: KeyStoreParams): string {
    if (!this.namespace) throw new Error('namespace not set');
    return KeyService.mintKey(this.namespace, type, params);
  }

  invalidateCache() {
    this.cache.invalidate();
  }

  async getSettings(bCreate = false): Promise<PubSubDBSettings> {
    let settings = this.cache?.getSettings();
    if (settings) {
      return settings;
    } else {
      if (bCreate) {
        const packageJson = await import('../../package.json');
        const version: string = packageJson.version;
        settings = { namespace: PSNS, version } as PubSubDBSettings;
        await this.setSettings(settings);
        return settings;
      }
    }
    throw new Error('settings not found');
  }

  async setSettings(manifest: PubSubDBSettings): Promise<any> {
    //PubSubDB heartbeat. If a connection is made, the version will be set
    const params: KeyStoreParams = {};
    const key = this.mintKey(KeyType.PUBSUBDB, params);
    return await this.redisClient[this.commands.hset](key, manifest);
  }

  async reserveSymbolRange(target: string, appId: string, size: number, type: 'JOB' | 'ACTIVITY'): Promise<[number, number, Symbols]> {
    const rangeKey = this.mintKey(KeyType.SYMKEYS, { appId });
    const symbolKey = this.mintKey(KeyType.SYMKEYS, { activityId: target, appId });
    //reserve the slot in a `pending` state (range will be established in the next step)
    const response = await this.redisClient[this.commands.hsetnx](rangeKey, target, '?:?');
    if (response) {
      //if the key didn't exist, set the inclusive range and seed metadata fields
      const upperLimit = await this.redisClient[this.commands.hincrby](rangeKey, ':cursor', size);
      const lowerLimit = upperLimit - size;
      const inclusiveRange = `${lowerLimit}:${upperLimit - 1}`;
      await this.redisClient[this.commands.hset](rangeKey, target, inclusiveRange);
      const metadataSeeds = this.seedSymbols(target, type, lowerLimit);
      await this.redisClient[this.commands.hset](symbolKey, metadataSeeds);
      return [lowerLimit + MDATA_SYMBOLS.SLOTS, upperLimit - 1, {} as Symbols];
    } else {
      //if the key already existed, get the lower limit and add the number of symbols
      const range = await this.redisClient[this.commands.hget](rangeKey, target);
      const  [lowerLimitString] = range.split(':');
      const lowerLimit = parseInt(lowerLimitString, 10);
      const symbols = await this.redisClient[this.commands.hgetall](symbolKey);
      const symbolCount = Object.keys(symbols).length;
      const actualLowerLimit = lowerLimit + MDATA_SYMBOLS.SLOTS + symbolCount;
      const upperLimit = Number(lowerLimit + size - 1);
      return [actualLowerLimit, upperLimit, symbols as Symbols];
    }
  }

  async getSymbols(activityId: string, appId: string): Promise<Symbols> {
    let symbols: Symbols = this.cache.getSymbols(appId, activityId);
    if (symbols) {
      return symbols;
    } else {
      const params: KeyStoreParams = { activityId, appId };
      const key = this.mintKey(KeyType.SYMKEYS, params);
      symbols = (await this.redisClient[this.commands.hgetall](key)) as Symbols;
      this.cache.setSymbols(appId, activityId, symbols);
      return symbols;
    }
  }

  async addSymbols(activityId: string, appId: string, symbols: Symbols): Promise<boolean> {
    const params: KeyStoreParams = { activityId, appId };
    const key = this.mintKey(KeyType.SYMKEYS, params);
    const success = await this.redisClient[this.commands.hset](key, symbols);
    this.cache.deleteSymbols(appId, activityId);
    return success > 0;
  }

  seedSymbols(target: string, type: 'JOB'|'ACTIVITY', startIndex: number): FlatDocument {
    if (type === 'JOB') {
      return this.seedJobSymbols(startIndex);
    }
    return this.seedActivitySymbols(startIndex, target);
  }

  seedJobSymbols(startIndex: number): FlatDocument {
    const hash: FlatDocument = {};
    MDATA_SYMBOLS.JOB.KEYS.forEach((key) => {
      hash[`metadata/${key}`] = numberToSequence(startIndex);
      startIndex++;
    });
    return hash;
  }

  seedActivitySymbols(startIndex: number, activityId: string): FlatDocument {
    const hash: FlatDocument = {};
    MDATA_SYMBOLS.ACTIVITY.KEYS.forEach((key) => {
      hash[`${activityId}/output/metadata/${key}`] = numberToSequence(startIndex);
      startIndex++;
    });
    return hash;
  }

  async getApp(id: string, refresh = false): Promise<PubSubDBApp> {
    let app: Partial<PubSubDBApp> = this.cache.getApp(id);
    if (refresh || !(app && Object.keys(app).length > 0)) {
      const params: KeyStoreParams = { appId: id };
      const key = this.mintKey(KeyType.APP, params);
      const sApp = await this.redisClient[this.commands.hgetall](key);
      if (!sApp) return null;
      app = {};
      for (const field in sApp) {
        try {
          app[field] = JSON.parse(sApp[field] as string);
        } catch (e) {
          app[field] = sApp[field];
        }
      }
      this.cache.setApp(id, app as PubSubDBApp);
    }
    return app as PubSubDBApp;
  }

  async setApp(id: string, version: string): Promise<PubSubDBApp> {
    const params: KeyStoreParams = { appId: id };
    const key = this.mintKey(KeyType.APP, params);
    const versionId = `versions/${version}`;
    const payload: PubSubDBApp = {
      id,
      version,
      [versionId]: `deployed:${new Date().toISOString()}`,
    };
    await this.redisClient[this.commands.hset](key, payload as any);
    this.cache.setApp(id, payload);
    return payload;
  }

  async activateAppVersion(id: string, version: string): Promise<boolean> {
    const params: KeyStoreParams = { appId: id };
    const key = this.mintKey(KeyType.APP, params);
    const versionId = `versions/${version}`;
    const app = await this.getApp(id);
    if (app && app[versionId]) {
      const payload: PubSubDBApp = {
        id,
        version,
        [versionId]: `activated:${new Date().toISOString()}`,
        active: true
      };
      Object.entries(payload).forEach(([key, value]) => {
        payload[key] = JSON.stringify(value);
      });
      const status = await this.redisClient[this.commands.hset](key, payload as any);
      return this.isSuccessful(status);
    }
    throw new Error(`Version ${version} does not exist for app ${id}`);
  }

  async registerAppVersion(appId: string, version: string): Promise<any> {
    const params: KeyStoreParams = { appId };
    const key = this.mintKey(KeyType.APP, params);
    const payload: PubSubDBApp = {
      id: appId,
      version,
      [`versions/${version}`]: new Date().toISOString()
    };
    return await this.redisClient[this.commands.hset](key, payload as any);
  }

  async setStats(jobKey: string, jobId: string, dateTime: string, stats: StatsType, appVersion: AppVID, multi? : U): Promise<any> {
    const params: KeyStoreParams = { appId: appVersion.id, jobId, jobKey, dateTime };
    const privateMulti = multi || this.getMulti();
    if (stats.general.length) {
      const generalStatsKey = this.mintKey(KeyType.JOB_STATS_GENERAL, params);
      for (const { target, value } of stats.general) {
        privateMulti[this.commands.hincrbyfloat](generalStatsKey, target, value as number);
      }
    }
    for (const { target, value } of stats.index) {
      const indexParams = { ...params, facet: target };
      const indexStatsKey = this.mintKey(KeyType.JOB_STATS_INDEX, indexParams);
      privateMulti[this.commands.rpush](indexStatsKey, value.toString());
    }
    for (const { target, value } of stats.median) {
      const medianParams = { ...params, facet: target };
      const medianStatsKey = this.mintKey(KeyType.JOB_STATS_MEDIAN, medianParams);
      this.zAdd(medianStatsKey, value, target, privateMulti);
    }
    if (!multi) {
      return await privateMulti.exec();
    }
  }

  hGetAllResult(result: any) {
    //default response signature uses 'redis' NPM Package format
    return result;
  }

  async getJobStats(jobKeys: string[]): Promise<JobStatsRange> {
    const multi = this.getMulti();
    for (const jobKey of jobKeys) {
      multi[this.commands.hgetall](jobKey);
    }
    const results = await multi.exec();
    const output: { [key: string]: JobStats } = {};
    for (const [index, result] of results.entries()) {
      const key = jobKeys[index];
      const statsHash: unknown = this.hGetAllResult(result);
      if (statsHash && Object.keys(statsHash).length > 0) {
        const resolvedStatsHash: JobStats = { ...statsHash as object };
        for (const [key, val] of Object.entries(resolvedStatsHash)) {
          resolvedStatsHash[key] = Number(val);
        }
        output[key] = resolvedStatsHash;
      } else {
        output[key] = {} as JobStats;
      }
    }
    return output;
  }

  async getJobIds(indexKeys: string[], idRange: [number, number]): Promise<IdsData> {
    const multi = this.getMulti();
    for (const idsKey of indexKeys) {
      multi[this.commands.lrange](idsKey, idRange[0], idRange[1]); //0,-1 returns all ids
    }
    const results = await multi.exec();
    const output: IdsData = {};
    for (const [index, result] of results.entries()) {
      const key = indexKeys[index];
      const idsList: string[] = result[1];
      if (idsList && idsList.length > 0) {
        output[key] = idsList;
      } else {
        output[key] = [];
      }
    }
    return output;
  }

  async setStatus(collationKeyStatus: number, jobId: string, appId: string, multi? : U): Promise<any> {
    const jobKey = this.mintKey(KeyType.JOB_STATE, { appId, jobId });
    return await (multi || this.redisClient)[this.commands.hincrbyfloat](jobKey, ':', collationKeyStatus);
  }

  async getStatus(jobId: string, appId: string): Promise<number> {
    const jobKey = this.mintKey(KeyType.JOB_STATE, { appId, jobId });
    const status = await this.redisClient[this.commands.hget](jobKey, ':');
    return Number(status);
  }

  async setState(state: MultiDimensionalDocument, status: number | null, jobId: string, appId: string, symbolNames: string[], multi? : U): Promise<string> {
    const hashKey = this.mintKey(KeyType.JOB_STATE, { appId, jobId });
    const symbolLookups = [];
    for (const symbolName of symbolNames) {
      symbolLookups.push(this.getSymbols(symbolName, appId));
    }
    const symbolSets = await Promise.all(symbolLookups);
    const abbreviationMaps: AbbreviationObjects = {};
    for (const symbolName of symbolNames) {
      abbreviationMaps[symbolName] = symbolSets.shift();
    }
    this.serializer.resetAbbreviationMaps(abbreviationMaps);
    delete state['metadata/js'];
    const hashData = this.serializer.package(state, symbolNames);
    if (status !== null) {
      hashData[':'] = status.toString();
    } else {
      delete hashData[':'];
    }
    await (multi || this.redisClient)[this.commands.hset](hashKey, hashData);
    return jobId;
  }

  async getState(jobId: string, appId: string, consumes: Consumes): Promise<[MultiDimensionalDocument, number] | undefined> {
    const key = this.mintKey(KeyType.JOB_STATE, { appId, jobId });
    const symbolNames = Object.keys(consumes);
    const symbolLookups = [];
    for (const symbolName of symbolNames) {
      symbolLookups.push(this.getSymbols(symbolName, appId));
    }
    const symbolSets = await Promise.all(symbolLookups);
    const abbreviationMaps: AbbreviationObjects = {};
    for (const symbolName of symbolNames) {
      abbreviationMaps[symbolName] = symbolSets.shift();
    }
    //always fetch the job status (':') when fetching state
    const fields = [':'];
    for (const symbolName of symbolNames) {
      const symbolSet = abbreviationMaps[symbolName];
      const symbolPaths = consumes[symbolName];
      for (const symbolPath of symbolPaths) {
        const abbreviation = symbolSet[symbolPath];
        if (abbreviation) {
          fields.push(abbreviation);
        } else {
          fields.push(symbolPath);
        }
      }
    }
    const jobDataArray = await this.redisClient[this.commands.hmget](key, fields);
    const jobData: MultiDimensionalDocument = {};
    fields.forEach((field, index) => {
      jobData[field] = jobDataArray[index];
    });
    this.serializer.resetAbbreviationMaps(abbreviationMaps);
    const state = this.serializer.unpackage(jobData, symbolNames);
    let status = 0;
    if (state[':']) {
      status = Number(state[':']);
      delete state[':'];
    }
    return [state, status];
  }

  async setStateNX(jobId: string, appId: string): Promise<boolean> {
    const hashKey = this.mintKey(KeyType.JOB_STATE, { appId, jobId });
    const result = await this.redisClient[this.commands.hsetnx](hashKey, ':', '1');
    return this.isSuccessful(result);
  }

  async getSchema(activityId: string, appVersion: AppVID): Promise<ActivityType> {
    const schema = this.cache.getSchema(appVersion.id, appVersion.version, activityId);
    if (schema) {
      return schema
    } else {
      const schemas = await this.getSchemas(appVersion);
      return schemas[activityId];
    }
  }

  async getSchemas(appVersion: AppVID): Promise<Record<string, ActivityType>> {
    let schemas = this.cache.getSchemas(appVersion.id, appVersion.version);
    if (schemas && Object.keys(schemas).length > 0) {
      return schemas;
    } else {
      const params: KeyStoreParams = { appId: appVersion.id, appVersion: appVersion.version };
      const key = this.mintKey(KeyType.SCHEMAS, params);
      schemas = {};
      const hash = await this.redisClient[this.commands.hgetall](key);
      Object.entries(hash).forEach(([key, value]) => {
        schemas[key] = JSON.parse(value as string);
      });
      this.cache.setSchemas(appVersion.id, appVersion.version, schemas);
      return schemas;
    }
  }

  async setSchemas(schemas: Record<string, ActivityType>, appVersion: AppVID): Promise<any> {
    const params: KeyStoreParams = { appId: appVersion.id, appVersion: appVersion.version };
    const key = this.mintKey(KeyType.SCHEMAS, params);
    const _schemas = {...schemas} as Record<string, string>;
    Object.entries(_schemas).forEach(([key, value]) => {
      _schemas[key] = JSON.stringify(value);
    });
    const response = await this.redisClient[this.commands.hset](key, _schemas);
    this.cache.setSchemas(appVersion.id, appVersion.version, schemas);
    return response;
  }

  async setSubscriptions(subscriptions: Record<string, any>, appVersion: AppVID): Promise<boolean> {
    const params: KeyStoreParams = { appId: appVersion.id, appVersion: appVersion.version };
    const key = this.mintKey(KeyType.SUBSCRIPTIONS, params);
    const _subscriptions = {...subscriptions};
    Object.entries(_subscriptions).forEach(([key, value]) => {
      _subscriptions[key] = JSON.stringify(value);
    });
    const status = await this.redisClient[this.commands.hset](key, _subscriptions);
    this.cache.setSubscriptions(appVersion.id, appVersion.version, subscriptions);
    return this.isSuccessful(status);
  }

  async getSubscriptions(appVersion: AppVID): Promise<Record<string, string>> {
    let subscriptions = this.cache.getSubscriptions(appVersion.id, appVersion.version);
    if (subscriptions && Object.keys(subscriptions).length > 0) {
      return subscriptions;
    } else {
      const params: KeyStoreParams = { appId: appVersion.id, appVersion: appVersion.version };
      const key = this.mintKey(KeyType.SUBSCRIPTIONS, params);
      subscriptions = await this.redisClient[this.commands.hgetall](key) || {};
      Object.entries(subscriptions).forEach(([key, value]) => {
        subscriptions[key] = JSON.parse(value as string);
      });
      this.cache.setSubscriptions(appVersion.id, appVersion.version, subscriptions);
      return subscriptions;
    }
  }

  async getSubscription(topic: string, appVersion: AppVID): Promise<string | undefined> {
    const subscriptions = await this.getSubscriptions(appVersion);
    return subscriptions[topic];
  }

  async setTransitions(transitions: Record<string, any>, appVersion: AppVID): Promise<any> {
    const params: KeyStoreParams = { appId: appVersion.id, appVersion: appVersion.version };
    const key = this.mintKey(KeyType.SUBSCRIPTION_PATTERNS, params);
    const _subscriptions = {...transitions};
    Object.entries(_subscriptions).forEach(([key, value]) => {
      _subscriptions[key] = JSON.stringify(value);
    });
    if (Object.keys(_subscriptions).length !== 0) {
      const response = await this.redisClient[this.commands.hset](key, _subscriptions);
      this.cache.setTransitions(appVersion.id, appVersion.version, transitions);
      return response;
    }
  }

  async getTransitions(appVersion: AppVID): Promise<Transitions> {
    let transitions = this.cache.getTransitions(appVersion.id, appVersion.version);
    if (transitions && Object.keys(transitions).length > 0) {
      return transitions;
    } else {
      const params: KeyStoreParams = { appId: appVersion.id, appVersion: appVersion.version };
      const key = this.mintKey(KeyType.SUBSCRIPTION_PATTERNS, params);
      transitions = {};
      const hash = await this.redisClient[this.commands.hgetall](key);
      Object.entries(hash).forEach(([key, value]) => {
        transitions[key] = JSON.parse(value as string);
      });
      this.cache.setTransitions(appVersion.id, appVersion.version, transitions);
      return transitions;
    }
  }

  async setHookRules(hookRules: Record<string, HookRule[]>): Promise<any> {
    const key = this.mintKey(KeyType.HOOKS, { appId: this.appId });
    const _hooks = { };
    Object.entries(hookRules).forEach(([key, value]) => {
      _hooks[key.toString()] = JSON.stringify(value);
    });
    if (Object.keys(_hooks).length !== 0) {
      const response = await this.redisClient[this.commands.hset](key, _hooks);
      this.cache.setHookRules(this.appId, hookRules);
      return response;
    }
  }

  async getHookRules(): Promise<Record<string, HookRule[]>> {
    let patterns = this.cache.getHookRules(this.appId);
    if (patterns && Object.keys(patterns).length > 0) {
      return patterns;
    } else {
      const key = this.mintKey(KeyType.HOOKS, { appId: this.appId });
      const _hooks = await this.redisClient[this.commands.hgetall](key);
      patterns = {};
      Object.entries(_hooks).forEach(([key, value]) => {
        patterns[key] = JSON.parse(value as string);
      });
      this.cache.setHookRules(this.appId, patterns);
      return patterns;
    }
  }

  async setHookSignal(hook: HookSignal, multi?: U): Promise<any> {
    const key = this.mintKey(KeyType.SIGNALS, { appId: this.appId });
    const { topic, resolved, jobId} = hook;
    const payload = {
      [`${topic}:${resolved}`]: jobId
    };
    return await (multi || this.redisClient)[this.commands.hset](key, payload);
  }

  async getHookSignal(topic: string, resolved: string): Promise<string | undefined> {
    const key = this.mintKey(KeyType.SIGNALS, { appId: this.appId });
    const multi = this.getMulti();
    multi[this.commands.hget](key, `${topic}:${resolved}`);
    multi[this.commands.hdel](key, `${topic}:${resolved}`);
    const response = await multi.exec();
    return response[0] ? response[0].toString() : undefined;
  }

  async addTaskQueues(keys: string[]): Promise<void> {
    const multi = this.getMulti();
    const zsetKey = this.mintKey(KeyType.WORK_ITEMS, { appId: this.appId });
    for (const key of keys) {
      multi[this.commands.zadd](zsetKey, { score: Date.now().toString(), value: key } as any, { NX: true });
    }
    await multi.exec();
  }

  async getActiveTaskQueue(): Promise<string | null> {
    let workItemKey = this.cache.getActiveTaskQueue(this.appId) || null;
    if (!workItemKey) {
      const zsetKey = this.mintKey(KeyType.WORK_ITEMS, { appId: this.appId });
      const result = await this.redisClient[this.commands.zrange](zsetKey, 0, 0);
      workItemKey = result.length > 0 ? result[0] : null;
      if (workItemKey) {
        this.cache.setWorkItem(this.appId, workItemKey);
      }
    }
    return workItemKey;
  }

  async deleteProcessedTaskQueue(workItemKey: string, key: string, processedKey: string): Promise<void> {
    const zsetKey = this.mintKey(KeyType.WORK_ITEMS, { appId: this.appId });
    const didRemove = await this.redisClient[this.commands.zrem](zsetKey, workItemKey);
    if (didRemove) {
      await this.redisClient[this.commands.rename](processedKey, key);
    }
    this.cache.removeWorkItem(this.appId);
  }

  async processTaskQueue(sourceKey: string, destinationKey: string): Promise<any> {
    return await this.redisClient[this.commands.lmove](sourceKey, destinationKey, 'LEFT', 'RIGHT');
  }
}

export { StoreService };
