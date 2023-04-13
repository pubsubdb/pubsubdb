"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisConnection = void 0;
const redis_1 = require("redis");
const config_1 = __importDefault(require("../config"));
class RedisConnection {
    constructor() {
        this.connection = null;
        this.id = null;
    }
    async createConnection(options) {
        return new Promise((resolve, reject) => {
            const client = (0, redis_1.createClient)(options);
            // Set up 'error' and 'ready' event handlers
            client.on('error', (error) => {
                reject(error);
            });
            client.on('ready', () => {
                //config.NODE_ENV !== 'test' && console.log('Redis connection is ready', config.REDIS_DATABASE);
                resolve(client);
            });
            // Connect to the Redis server
            client.connect();
        });
    }
    async getClient() {
        if (!this.connection) {
            throw new Error('Redis client is not connected');
        }
        return this.connection;
    }
    async disconnect() {
        if (this.connection) {
            await this.connection.quit();
            this.connection = null;
        }
        if (this.id) {
            RedisConnection.instances.delete(this.id);
        }
    }
    static async getConnection(id, options) {
        if (this.instances.has(id)) {
            return this.instances.get(id);
        }
        const instance = new RedisConnection();
        const mergedOptions = { ...this.clientOptions, ...options };
        instance.connection = await instance.createConnection(mergedOptions);
        instance.id = id;
        this.instances.set(id, instance);
        return instance;
    }
    static async disconnectAll() {
        await Promise.all(Array.from(this.instances.values()).map((instance) => instance.disconnect()));
        this.instances.clear();
    }
}
exports.RedisConnection = RedisConnection;
RedisConnection.instances = new Map();
RedisConnection.clientOptions = {
    socket: {
        host: 'redis',
        port: 6379,
        tls: false,
    },
    password: 'key_admin',
    database: config_1.default.REDIS_DATABASE,
};
