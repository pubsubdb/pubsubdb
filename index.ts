import { PubSubDBService as PubSubDB } from './services/pubsubdb';
import { RedisStoreService as RedisStore } from "./services/store/clients/redis";
import { RedisStreamService as RedisStream } from "./services/stream/clients/redis";
import { RedisSubService as RedisSub } from "./services/sub/clients/redis";
import { IORedisStoreService as IORedisStore } from "./services/store/clients/ioredis";
import { IORedisStreamService as IORedisStream } from "./services/stream/clients/ioredis";
import { IORedisSubService as IORedisSub } from "./services/sub/clients/ioredis";
import { StoreService as Store } from "./services/store";
import { StreamService as Stream } from "./services/stream";
import { SubService as Sub } from "./services/sub";
import { PubSubDBConfig } from './typedefs/pubsubdb';

export {
  PubSubDB,
  PubSubDBConfig,

  //redis NPM package wrappers
  RedisStore,
  RedisStream,
  RedisSub,

  //ioredis NPM package wrappers
  IORedisStore,
  IORedisStream,
  IORedisSub,

  //base abstract classes (if authoring a custom wrapper)
  Store,
  Stream,
  Sub
};
