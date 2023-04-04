import fastify from 'fastify';
import fastifyAuth from '@fastify/auth';
import fastifyBasicAuth from '@fastify/basic-auth';
import fastifyMultipart from '@fastify/multipart';
import fastifySwagger from '@fastify/swagger';
// import fastifySwaggerUI from '@fastify/swagger-ui';
import { RedisConnection } from '../cache/redis';
import { registerAppRoutes } from './routes';

const server = fastify({ logger: true });

// Register Fastify plugins
server.register(fastifyAuth);
server.register(fastifyBasicAuth, { validate: async (username, password, req, reply) => { /* Your validation logic here */ } });
server.register(fastifyMultipart, { /* Multipart options here */ });
server.register(fastifySwagger, { /* Swagger options here */ });

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
registerAppRoutes(server);

// Start the server
const start = async () => {
  try {
    await server.listen({ port: 3000, path: '0.0.0.0' });
    console.log('Server is running on port 3000');
    console.log('Redis');
    const redisConnection = await RedisConnection.getConnection('instance1');
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
    await redisClient.json.set(KEY, '.', {"inventory":{"headphones":[{"id":12345,"name":"Noise-cancelling Bluetooth headphones","description":"Wireless Bluetooth headphones with noise-cancelling technology","wireless":true,"connection":"Bluetooth","price":99.98,"stock":25,"free-shipping":false,"colors":["black","silver"]},{"id":12346,"name":"Wireless earbuds","description":"Wireless Bluetooth in-ear headphones","wireless":true,"connection":"Bluetooth","price":64.99,"stock":17,"free-shipping":false,"colors":["black","white"]},{"id":12347,"name":"Mic headset","description":"Headset with built-in microphone","wireless":false,"connection":"USB","price":35.01,"stock":28,"free-shipping":false}],"keyboards":[{"id":22345,"name":"Wireless keyboard","description":"Wireless Bluetooth keyboard","wireless":true,"connection":"Bluetooth","price":44.99,"stock":23,"free-shipping":false,"colors":["black","silver"]},{"id":22346,"name":"USB-C keyboard","description":"Wired USB-C keyboard","wireless":false,"connection":"USB-C","price":29.99,"stock":30,"free-shipping":false}]}}, { NX: true });
    const query = { path: '$..[?(@.stock==23||@.stock==30)]' };
    const filteredItems = await redisClient.json.get(KEY, query);
    console.log(filteredItems);

    // shut down server
    function shutdown() {
      server.close(() => {
        RedisConnection.disconnectAll();
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
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

//start();
start();
