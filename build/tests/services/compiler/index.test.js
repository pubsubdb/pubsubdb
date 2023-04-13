"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const redis_1 = require("../../../services/store/redis");
const redis_2 = require("../../../cache/redis");
const compiler_1 = require("../../../services/compiler");
const keyStore_1 = require("../../../services/store/keyStore");
describe("Compiler Service", () => {
    const appConfig = { id: 'test-app', version: '1' };
    const CONNECTION_KEY = 'manual-test-connection';
    let redisConnection;
    let redisClient;
    let redisStore;
    beforeAll(async () => {
        redisConnection = await redis_2.RedisConnection.getConnection(CONNECTION_KEY);
        redisClient = await redisConnection.getClient();
        redisClient.flushDb();
        redisStore = new redis_1.RedisStoreService(redisClient);
        //the store must be initialized before the compiler service can use it (engine typically does this)
        await redisStore.init(keyStore_1.PSNS, appConfig.id);
    });
    afterAll(async () => {
        await redis_2.RedisConnection.disconnectAll();
    });
    describe("plan()", () => {
        it("should plan an app deployment, using a path", async () => {
            const compilerService = new compiler_1.CompilerService(redisStore);
            await compilerService.plan('/app/seeds/pubsubdb.yaml');
        });
    });
    describe("deploy()", () => {
        it("should deploy an app to Redis, using a path", async () => {
            const compilerService = new compiler_1.CompilerService(redisStore);
            await compilerService.deploy('/app/seeds/pubsubdb.yaml');
        });
    });
    describe("activate()", () => {
        it("should activate a deployed app version", async () => {
            const compilerService = new compiler_1.CompilerService(redisStore);
            await compilerService.activate('test-app', '1');
        });
    });
});
