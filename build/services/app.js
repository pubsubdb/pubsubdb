"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppService = void 0;
const redis_1 = require("../cache/redis");
class AppService {
    async create(appData) {
        try {
            const redisConnection = await redis_1.RedisConnection.getConnection('test-connection');
            console.log('Connection established:', redisConnection);
            const redisClient = await redisConnection.getClient();
            const { name, title } = appData;
            const isSet = await redisClient.hSetNX(name, 'title', title);
            if (!isSet) {
                throw new Error(`App with name "${name}" already exists.`);
            }
            return appData;
        }
        catch (error) {
            console.error('Error in AppService.create():', error);
            throw error;
        }
    }
}
const appServiceInstance = new AppService();
exports.AppService = appServiceInstance;
