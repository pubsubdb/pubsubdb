import { PubSubDBService } from "../services/pubsubdb";
import { RedisStoreService } from "../services/store/redis";
import { StoreService } from "../services/store/store";

type PubSubDB = typeof PubSubDBService;

type PubSubDBConfig = {
  appId: string;       // customer's chosen app id
  store: StoreService; // redis store wrapping customer's redis instance
  namespace?: string;  //default 'psdb'
  cluster?: boolean;   //default false
}

type PubSubDBGraph = {
  subscribes: string;
  publishes: string;
  activities: Record<string, any>;
  transitions: Record<string, any>;
  hooks: Record<string, any>;
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