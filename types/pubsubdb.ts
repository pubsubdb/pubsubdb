import { ILogger } from "../services/logger";
import { PubSubDBService } from "../services/pubsubdb";
import { HookRules } from "./hook";
import { RedisClass, RedisClient, RedisOptions } from "./redis";
import { StreamData, StreamDataResponse } from "./stream";

type PubSubDB = typeof PubSubDBService;

type PubSubDBEngine = {
  store?: RedisClient;  //set by pubsubdb using instanced `redis` class
  stream?: RedisClient; //set by pubsubdb using instanced `redis` class
  sub?: RedisClient;    //set by pubsubdb using instanced `redis` class
  redis?: {
    class: RedisClass;
    options: RedisOptions;
  };
  reclaimDelay?: number; //milliseconds
  reclaimCount?: number;
}

type PubSubDBWorker = {
  topic: string;
  store?: RedisClient;  //set by pubsubdb using instanced `redis` class
  stream?: RedisClient; //set by pubsubdb using instanced `redis` class
  sub?: RedisClient;    //set by pubsubdb using instanced `redis` class
  redis?: {
    class: RedisClass;
    options: RedisOptions;
  };
  reclaimDelay?: number; //milliseconds
  reclaimCount?: number; //max number of times to reclaim a stream
  callback: (payload: StreamData) => Promise<StreamDataResponse|void>;
}

type PubSubDBConfig = {
  appId: string;
  namespace?: string;
  name?: string;
  logger?: ILogger;
  logLevel?: 'silly' | 'debug' | 'info' | 'warn' | 'error' | 'silent';
  engine?: PubSubDBEngine;
  workers?: PubSubDBWorker[];
}

type PubSubDBGraph = {
  subscribes: string;
  publishes?: string;
  expire?: number;
  output?: {
    schema: Record<string, any>;
  };
  input?: {
    schema: Record<string, any>;
  };
  activities: Record<string, any>;
  transitions?: Record<string, any>;
  hooks?: HookRules;
};

type PubSubDBSettings = {
  namespace: string;
  version: string;
};

type PubSubDBManifest = {
  app: {
    id: string;
    version: string;
    settings: Record<string, any>;
    graphs: PubSubDBGraph[];
  };
};

type VersionedFields = {
  [K in `versions/${string}`]: any;
};

type PubSubDBApp = VersionedFields & {
  id: string;        // customer's chosen app id
  version: string;   // customer's chosen version scheme (semver, etc)
  settings?: string; // stringified JSON for app settings
  active?: boolean;  // is the app active?
};

type PubSubDBApps = {
  [appId: string]: PubSubDBApp;
};

export {
  PubSubDB,
  PubSubDBEngine,
  PubSubDBWorker,
  PubSubDBSettings,
  PubSubDBApp,    //a single app in the db
  PubSubDBApps,   //object array of all apps in the db
  PubSubDBConfig, //customer config
  PubSubDBManifest,
  PubSubDBGraph
};
