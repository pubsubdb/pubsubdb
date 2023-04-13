"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisClientType = exports.RedisConnection = void 0;
const ioredis_1 = require("ioredis");
Object.defineProperty(exports, "RedisClientType", { enumerable: true, get: function () { return ioredis_1.Redis; } });
const config_1 = __importDefault(require("../config"));
class RedisConnection {
    constructor() {
        this.connection = null;
        this.id = null;
    }
    async createConnection(options) {
        return new Promise((resolve, reject) => {
            resolve(new ioredis_1.Redis(options));
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
    host: 'redis',
    port: 6379,
    password: 'key_admin',
    db: config_1.default.REDIS_DATABASE,
};
