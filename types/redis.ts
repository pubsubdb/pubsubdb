import { RedisClientType as RCT, RedisMultiType as RMT } from './redisclient';
import { RedisClientType as IORCT, RedisMultiType as IORMT } from './ioredisclient';

type RedisClient = RCT | IORCT;
type RedisMulti = RMT | IORMT;

type MultiResponseFlags = (string | number)[]; // e.g., [3, 2, '968000000000000']

export { RedisClient, RedisMulti, MultiResponseFlags }
