import { RedisClientType } from "../../../typedefs/redis"
import { RedisStoreService as RedisStore } from "../../../services/store/redis";
import { RedisConnection } from "../../../cache/redis";
import { CompilerService } from "../../../services/compiler";

describe("Compiler Service", () => {
  const CONNECTION_KEY = 'manual-test-connection';
  let redisConnection: RedisConnection;
  let redisClient: RedisClientType;
  let redisStore: RedisStore;

  beforeAll(async () => {
    redisConnection = await RedisConnection.getConnection(CONNECTION_KEY);
    redisClient = await redisConnection.getClient();
    redisClient.flushDb();
    redisStore = new RedisStore(redisClient);
  });

  afterAll(async () => {
    await RedisConnection.disconnectAll();
  });

  it("should compile YAML", async () => {
    const compilerService = new CompilerService(redisStore);
    const activityMetadata = await compilerService.compile();
    expect(activityMetadata).not.toBeNull();
  });
});
