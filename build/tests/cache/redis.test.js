"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const redis_1 = require("../../cache/redis");
describe('RedisConnection', () => {
    afterEach(async () => {
        await redis_1.RedisConnection.disconnectAll();
    });
    it('should create a connection to Redis', async () => {
        const redisConnection = await redis_1.RedisConnection.getConnection('test-connection');
        expect(redisConnection).toBeInstanceOf(redis_1.RedisConnection);
        expect(await redisConnection.getClient()).not.toBeNull();
    });
    it('should throw an error when trying to get a client before connecting', async () => {
        try {
            await redis_1.RedisConnection.getConnection('test-connection', { password: 'bad_password' });
        }
        catch (error) {
            return expect(error.message).not.toBeNull();
        }
        throw new Error('Expected an error to be thrown');
    });
    it('should disconnect from Redis', async () => {
        const redisConnection = await redis_1.RedisConnection.getConnection('test-connection');
        await redisConnection.disconnect();
        expect(redisConnection.getClient()).rejects.toThrow('Redis client is not connected');
    });
    it('should disconnect all instances', async () => {
        await redis_1.RedisConnection.getConnection('test-connection-1');
        await redis_1.RedisConnection.getConnection('test-connection-2');
        await redis_1.RedisConnection.disconnectAll();
        expect(redis_1.RedisConnection['instances'].size).toBe(0);
    });
    it('should set and get a value from Redis', async () => {
        const redisConnection = await redis_1.RedisConnection.getConnection('test-connection');
        const redisClient = await redisConnection.getClient();
        await redisClient.set('test-key', 'test-value');
        const val = await redisClient.get('test-key');
        expect(val).toBe('test-value');
    });
    it('publishes and subscribes', async () => {
        const publisher = await redis_1.RedisConnection.getConnection('publisher');
        const subscriber = await redis_1.RedisConnection.getConnection('subscriber');
        const publisherClient = await publisher.getClient();
        const subscriberClient = await subscriber.getClient();
        await subscriberClient.subscribe('article', (message) => {
            expect(message).toBe('message');
        });
        await publisherClient.publish('article', 'message');
    });
});
