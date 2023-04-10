import { RedisClientType } from "../../../typedefs/redis"
import { RedisStoreService as RedisStore } from "../../../services/store/redis";
import { RedisConnection } from "../../../cache/redis";
import { CompilerService } from "../../../services/compiler";
import { PSNS } from "../../../services/store/keyStore";

describe("Compiler Service", () => {
  const appConfig = { id: 'test-app', version: '1' };
  const CONNECTION_KEY = 'manual-test-connection';
  let redisConnection: RedisConnection;
  let redisClient: RedisClientType;
  let redisStore: RedisStore;

  beforeAll(async () => {
    redisConnection = await RedisConnection.getConnection(CONNECTION_KEY);
    redisClient = await redisConnection.getClient();
    redisClient.flushDb();
    redisStore = new RedisStore(redisClient);
    //the store must be initialized before the compiler service can use it (engine typically does this)
    await redisStore.init(PSNS, appConfig.id);
  });

  afterAll(async () => {
    await RedisConnection.disconnectAll();
  });

  describe("plan()", () => {
    it("should plan an app deployment, using a path", async () => {
      const compilerService = new CompilerService(redisStore);
      await compilerService.plan('/app/seeds/pubsubdb.yaml');
    });
  });

  describe("deploy()", () => {
    it("should deploy an app to Redis, using a path", async () => {
      const compilerService = new CompilerService(redisStore);
      await compilerService.deploy('/app/seeds/pubsubdb.yaml');
    });
  });

  describe("activate()", () => {
    it("should activate a deployed app version", async () => {
      const compilerService = new CompilerService(redisStore);
      await compilerService.activate('test-app', '1');
    });
  });
});
