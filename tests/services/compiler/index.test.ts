import { IORedisStoreService as IORedisStore } from "../../../services/store/stores/ioredis";
import { RedisConnection, RedisClientType } from "../../$setup/cache/ioredis";
import { CompilerService } from "../../../services/compiler";
import { PSNS } from "../../../services/store/key";
import { LoggerService } from "../../../services/logger";

describe("Compiler Service", () => {
  const appConfig = { id: 'test-app', version: '1' };
  const CONNECTION_KEY = 'manual-test-connection';
  let redisConnection: RedisConnection;
  let redisClient: RedisClientType;
  let redisStore: IORedisStore;

  beforeAll(async () => {
    redisConnection = await RedisConnection.getConnection(CONNECTION_KEY);
    redisClient = await redisConnection.getClient();
    redisClient.flushdb();
    redisStore = new IORedisStore(redisClient);
    //the store must be initialized before the compiler service can use it (engine typically does this)
    await redisStore.init(PSNS, appConfig.id, new LoggerService());
  });

  afterAll(async () => {
    await RedisConnection.disconnectAll();
  });

  describe("plan()", () => {
    it("should plan an app deployment, using a path", async () => {
      const compilerService = new CompilerService(redisStore, new LoggerService());
      await compilerService.plan('/app/tests/$setup/seeds/pubsubdb.yaml');
    });
  });

  describe("deploy()", () => {
    it("should deploy an app to Redis, using a path", async () => {
      const compilerService = new CompilerService(redisStore, new LoggerService());
      await compilerService.deploy('/app/tests/$setup/seeds/pubsubdb.yaml');
    });
  });

  describe("activate()", () => {
    it("should activate a deployed app version", async () => {
      const compilerService = new CompilerService(redisStore, new LoggerService());
      await compilerService.activate('test-app', '1');
    });
  });
});
