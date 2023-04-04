import { createClient } from 'redis';

export type RedisClientType = ReturnType<typeof createClient>;
