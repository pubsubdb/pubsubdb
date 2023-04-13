"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const auth_1 = __importDefault(require("@fastify/auth"));
const basic_auth_1 = __importDefault(require("@fastify/basic-auth"));
const multipart_1 = __importDefault(require("@fastify/multipart"));
const swagger_1 = __importDefault(require("@fastify/swagger"));
// import fastifySwaggerUI from '@fastify/swagger-ui';
const redis_1 = require("../cache/redis");
const routes_1 = require("./routes");
const server = (0, fastify_1.default)({ logger: true });
// Register Fastify plugins
server.register(auth_1.default);
server.register(basic_auth_1.default, { validate: async (username, password, req, reply) => { } });
server.register(multipart_1.default, { /* Multipart options here */});
server.register(swagger_1.default, { /* Swagger options here */});
// The usage of fastify-swagger-ui is a bit different, as it's not an official Fastify plugin
// Serve Swagger UI using Fastify
// server.get('/docs/*', async (request, reply) => {
//   const basePath = '/docs';
//   const path = request.url.slice(basePath.length) || '/index.html';
//   const fileStream = fastifySwaggerUI(path);
//   if (fileStream) {
//     reply.send(fileStream);
//   } else {
//     reply.code(404).send({ error: 'Not Found' });
//   }
// });
// Your routes and other configurations here
(0, routes_1.registerAppRoutes)(server);
// Start the server
const start = async () => {
    try {
        await server.listen({ port: 3000, path: '0.0.0.0' });
        console.log('Server is running on port 3000');
        const redisConnection = await redis_1.RedisConnection.getConnection('instance1');
        const redisClient = await redisConnection.getClient();
        await redisClient.set('test:key', 'test value');
        const response = redisClient.get('test:key');
        console.log('response', { response: await response });
        // RedisJSON (https://oss.redislabs.com/redisjson)
        await redisClient.json.set('TEST_KEY', '.', { node: 4305 });
        const value = await redisClient.json.get('TEST_KEY', {
            path: '.node',
        });
        console.log('value', { value });
        // RedisJSON Query (Get the items with a stock value of 23 or 30)
        const KEY = 'store';
        await redisClient.json.set(KEY, '.', { "inventory": { "headphones": [{ "id": 12345, "name": "Noise-cancelling Bluetooth headphones", "description": "Wireless Bluetooth headphones with noise-cancelling technology", "wireless": true, "connection": "Bluetooth", "price": 99.98, "stock": 25, "free-shipping": false, "colors": ["black", "silver"] }, { "id": 12346, "name": "Wireless earbuds", "description": "Wireless Bluetooth in-ear headphones", "wireless": true, "connection": "Bluetooth", "price": 64.99, "stock": 17, "free-shipping": false, "colors": ["black", "white"] }, { "id": 12347, "name": "Mic headset", "description": "Headset with built-in microphone", "wireless": false, "connection": "USB", "price": 35.01, "stock": 28, "free-shipping": false }], "keyboards": [{ "id": 22345, "name": "Wireless keyboard", "description": "Wireless Bluetooth keyboard", "wireless": true, "connection": "Bluetooth", "price": 44.99, "stock": 23, "free-shipping": false, "colors": ["black", "silver"] }, { "id": 22346, "name": "USB-C keyboard", "description": "Wired USB-C keyboard", "wireless": false, "connection": "USB-C", "price": 29.99, "stock": 30, "free-shipping": false }] } }, { NX: true });
        const query = { path: '$..[?(@.stock==23||@.stock==30)]' };
        const filteredItems = await redisClient.json.get(KEY, query);
        console.log('filtered', filteredItems);
        // shut down server
        function shutdown() {
            server.close(() => {
                redis_1.RedisConnection.disconnectAll();
                process.exit(0);
            });
        }
        // quit on ctrl-c when running docker in terminal
        process.on('SIGINT', function onSigint() {
            console.log('Got SIGINT (aka ctrl-c in docker). Graceful shutdown', { loggedAt: new Date().toISOString() });
            shutdown();
        });
        // quit properly on docker stop
        process.on('SIGTERM', function onSigterm() {
            console.log('Got SIGTERM (docker container stop). Graceful shutdown', { loggedAt: new Date().toISOString() });
            shutdown();
        });
    }
    catch (err) {
        console.error(err);
        process.exit(1);
    }
};
//start();
start();
