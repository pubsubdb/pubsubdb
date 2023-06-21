import { ILogger } from "../services/logger";
import { PubSubDBService } from "../services/pubsubdb";
import { StoreService } from "../services/store";
import { HookRules } from "./hook";
import { RedisClient, RedisMulti } from "./redis";
import { StreamData, StreamDataResponse } from "./stream";
import { StreamService } from "../services/stream";
import { SubService } from "../services/sub";

type PubSubDB = typeof PubSubDBService;

type PubSubDBEngine = {
  store: StoreService<RedisClient, RedisMulti>;
  stream: StreamService<RedisClient, RedisMulti>;
  sub: SubService<RedisClient, RedisMulti>;
}

type PubSubDBWorker = {
  topic: string;
  store: StoreService<RedisClient, RedisMulti>;
  stream: StreamService<RedisClient, RedisMulti>;
  sub: SubService<RedisClient, RedisMulti>;
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
  del?: number;
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
  StoreService,
  PubSubDBManifest,
  PubSubDBGraph
};
