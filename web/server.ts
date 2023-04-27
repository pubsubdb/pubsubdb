import fastify from 'fastify';
import fastifyAuth from '@fastify/auth';
import fastifyBasicAuth from '@fastify/basic-auth';
import fastifyMultipart from '@fastify/multipart';
import { RedisConnection } from '../cache/ioredis';
import { registerAppRoutes } from './routes';
import { IORedisStore, PubSubDB, PubSubDBConfig } from '../index';

//init server and plugins
const server = fastify({ logger: true });
server.register(fastifyAuth);
server.register(fastifyBasicAuth, { validate: async (username, password, req, reply) => { /* Your validation logic here */ } });
server.register(fastifyMultipart, { /* Multipart options here */ });

//init redis connection and pubsubdb interface
const initPubSubDB = async () => {
  //initialize the redis connection for the rw client and the subscriber client
  const redisConnection = await RedisConnection.getConnection('instance1');
  const redisClient = await redisConnection.getClient();
  const redisSubConnection = await RedisConnection.getConnection('subscriber1');
  const redisSubClient = await redisSubConnection.getClient();

  const config: PubSubDBConfig = {
    appId: 'test-app',
    namespace: 'psdb',
    store: new IORedisStore(redisClient, redisSubClient)
  };

  //deploy app version 1 (if v1 is already active this has no impact)
  const pubSubDB = await PubSubDB.init(config);
  await pubSubDB.plan('/app/seeds/pubsubdb.yaml');
  await pubSubDB.deploy('/app/seeds/pubsubdb.yaml');
  await pubSubDB.activate('1');
  return pubSubDB;
};

// Start the server
const start = async () => {
  //init pubsubdb
  const pubsubdb = await initPubSubDB();

  //init the http routes
  registerAppRoutes(server, pubsubdb);

  //start server on default port
  try {
    await server.listen({ port: 3000, path: '0.0.0.0' });
    console.log('Server is running on port 3000');

    // server shutdown/cleanup redis
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
