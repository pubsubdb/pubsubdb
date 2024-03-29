import { Connection, ConnectionConfig } from "../../types/durable";

/*

Here is an example of how the methods in this file are used:

./worker.ts

import { Durable: { NativeConnection, Worker } } from '@pubsubdb/pubsubdb';
import Redis from 'ioredis'; //OR `import * as Redis from 'redis';`

import * as activities from './activities';

async function run() {
  const connection = await NativeConnection.connect({
    class: Redis,
    options: {
      host: 'localhost',
      port: 6379,
    },
  });
  const worker = await Worker.create({
    connection,
    namespace: 'default',
    taskQueue: 'hello-world',
    workflowsPath: require.resolve('./workflows'),
    activities,
  });
  await worker.run();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

*/

export class NativeConnectionService {
  static async connect(config: ConnectionConfig): Promise<Connection> {
    return {
      class: config.class,
      options: { ...config.options },
     } as Connection;
  }
}
