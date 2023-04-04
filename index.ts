import { ConnectorService as Connector } from './services/connector';
import { EngineService as Engine } from './services/engine';
import { PubSubDBService } from './services/pubsubdb';
import { RedisJSONStoreService as RedisJSONStore } from './services/store/redisJSON';
import { RedisStoreService as RedisStore } from "./services/store/redis";
import { StoreService as Store } from "./services/store/store";
import { PubSubDBConfig } from './typedefs/pubsubdb';

const PubSubDB = new PubSubDBService();

export { PubSubDB, PubSubDBConfig, Connector, Engine, RedisJSONStore, RedisStore, Store };
