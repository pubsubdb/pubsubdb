import { RedisClientType as RCT, RedisMultiType as RMT } from './redisclient';
import { RedisClientType as IORCT, RedisMultiType as IORMT } from './ioredisclient';

type RedisClient = RCT | IORCT;
type RedisMulti = RMT | IORMT;

export { RedisClient, RedisMulti }
