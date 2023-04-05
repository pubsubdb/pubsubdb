import { PubSubDBService } from "../services/pubsubdb";
import { RedisStoreService } from "../services/store/redis";
import { StoreService } from "../services/store/store";

type PubSubDB = typeof PubSubDBService;

type PubSubDBConfig = {
  store: StoreService;
  cluster?: boolean; //default false if undefined
}

export {
  PubSubDB,
  PubSubDBConfig,
  StoreService,
  RedisStoreService
};