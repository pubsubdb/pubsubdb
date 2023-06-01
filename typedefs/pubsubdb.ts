import { ILogger } from "../services/logger";
import { PubSubDBService } from "../services/pubsubdb";
import { RedisStoreService } from "../services/store/clients/redis";
import { StoreService } from "../services/store";
import { Hooks } from "./hook";
import { RedisClient, RedisMulti } from "./redis";
import { StreamData, StreamDataResponse } from "./stream";
import { StreamService } from "../services/stream";
import { SubService } from "../services/sub";
import { StreamSignaler } from "../services/signaler/stream";

type PubSubDB = typeof PubSubDBService;

type PubSubDBConfig = {
  appId: string;       // customer-chosen app id
  namespace?: string;  // default: `psdb` (customer may ovveride)
  logger?: ILogger;
  engine?: {
    store: StoreService<RedisClient, RedisMulti>;
    stream: StreamService<RedisClient, RedisMulti>;
    sub: SubService<RedisClient, RedisMulti>;
  };
  workers?: {
    topic: string;
    store: StoreService<RedisClient, RedisMulti>;
    stream: StreamService<RedisClient, RedisMulti>;
    sub?: SubService<RedisClient, RedisMulti>; //used for rollcall, worker suppression, etc
    callback: (payload: StreamData) => Promise<StreamDataResponse|void>;
    streamSignaler?: StreamSignaler; //bound by engine during initialization
  }[];
}

type PubSubDBGraph = {
  subscribes: string;
  publishes?: string;
  output?: {
    schema: Record<string, any>;
  };
  input?: {
    schema: Record<string, any>;
  };
  activities: Record<string, any>;
  transitions?: Record<string, any>;
  hooks?: Hooks;
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
  PubSubDBSettings,
  PubSubDBApp,    //a single app in the db
  PubSubDBApps,   //object array of all apps in the db
  PubSubDBConfig, //customer config
  StoreService,
  RedisStoreService,
  PubSubDBManifest,
  PubSubDBGraph
};