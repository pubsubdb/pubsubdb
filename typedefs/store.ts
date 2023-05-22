import { RedisClientType as RCT, RedisMultiType as RMT } from './redis';
import { RedisClientType as IORCT, RedisMultiType as IORMT } from './ioredis';

type RedisClient = RCT | IORCT;
type RedisMulti = RMT | IORMT;

export { RedisClient, RedisMulti }
