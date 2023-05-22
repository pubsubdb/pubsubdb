import { createClient } from 'redis';

export type RedisClientType = ReturnType<typeof createClient>;

export interface RedisMultiType {
  HDEL(key: string, itemId: string): this;
  HGET(key: string, itemId: string): this;
  HGETALL(key: string): this;
  HINCRBYFLOAT(key: string, itemId: string, value: number): this;
  HMGET(key: string, itemIds: string[]): this;
  HSET(key: string, values: Record<string, string>): this;
  LRANGE(key: string, start: number, end: number): this;
  RPUSH(key: string, value: string): this;
  ZADD(key: string, values: { score: string, value: string }): this;
  exec: () => Promise<unknown[]>;
}
