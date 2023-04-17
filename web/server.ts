import fastify from 'fastify';
import fastifyAuth from '@fastify/auth';
import fastifyBasicAuth from '@fastify/basic-auth';
import fastifyMultipart from '@fastify/multipart';
import { RedisConnection } from '../cache/ioredis';
import { registerAppRoutes } from './routes';

const server = fastify({ logger: true });

// Register Fastify plugins
server.register(fastifyAuth);
server.register(fastifyBasicAuth, { validate: async (username, password, req, reply) => { /* Your validation logic here */ } });
server.register(fastifyMultipart, { /* Multipart options here */ });

// Your routes and other configurations here
registerAppRoutes(server);

// Start the server
const start = async () => {
  try {
    await server.listen({ port: 3000, path: '0.0.0.0' });
    console.log('Server is running on port 3000');
    const redisConnection = await RedisConnection.getConnection('instance1');
    const redisClient = await redisConnection.getClient();
    await redisClient.set('test:key', 'test value');
    const response = redisClient.get('test:key');
    console.log('response', { response: await response });

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
