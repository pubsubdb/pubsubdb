import { createClient } from 'redis';

export type RedisClientType = ReturnType<typeof createClient>;

interface ExecMethod {
  exec: () => Promise<any>; // Replace 'any' with the appropriate return type for the exec method
}

export type RedisMultiType = RedisClientType & ExecMethod;
