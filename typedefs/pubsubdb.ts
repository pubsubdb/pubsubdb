import { PubSubDBService } from "../services/pubsubdb";
import { RedisStoreService } from "../services/store/redis";
import { StoreService } from "../services/store/store";

type PubSubDB = typeof PubSubDBService;

type PubSubDBConfig = {
  store: StoreService;
  cluster?: boolean; //default false if undefined
}

type PubSubDBManifest = {
  app: {
    id: string;
    version: number;
    settings: Record<string, any>;
    graphs: Array<{
      subscribes: string;
      publishes: string;
      activities: Record<string, any>;
    }>;
  };
};


export {
  PubSubDB,
  PubSubDBConfig,
  StoreService,
  RedisStoreService,
  PubSubDBManifest
};