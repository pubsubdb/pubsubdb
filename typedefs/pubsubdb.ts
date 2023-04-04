import { ConnectorService } from "../services/connector";
import { EngineService } from "../services/engine"
import { PubSubDBService } from "../services/pubsubdb";
import { RedisStoreService } from "../services/store/redis";
import { StoreService } from "../services/store/store";

type PubSubDB = typeof PubSubDBService;

type PubSubDBModule = typeof EngineService | typeof ConnectorService;

type PubSubDBConfig = {
  modules: PubSubDBModule[];
  store: StoreService;
}

export {
  PubSubDB,
  PubSubDBConfig,
  PubSubDBModule,
  StoreService,
  RedisStoreService
};