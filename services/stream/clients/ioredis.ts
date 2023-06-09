import { KeyService, KeyStoreParams, KeyType, PSNS } from '../../../modules/key';
import { ILogger } from '../../logger';
import { StreamService } from '../index';
import { RedisClientType, RedisMultiType } from '../../../types/ioredisclient';

class IORedisStreamService extends StreamService<RedisClientType, RedisMultiType> {
  redisClient: RedisClientType;
  namespace: string;
  logger: ILogger;
  appId: string;

  constructor(redisClient: RedisClientType) {
    super(redisClient);
  }

  async init(namespace = PSNS, appId: string, logger: ILogger): Promise<void> {
    this.namespace = namespace;
    this.logger = logger;
    this.appId = appId;
  }

  getMulti(): RedisMultiType {
    return this.redisClient.multi();
  }

  mintKey(type: KeyType, params: KeyStoreParams): string {
    if (!this.namespace) throw new Error('namespace not set');
    return KeyService.mintKey(this.namespace, type, params);
  }

  async xgroup(command: 'CREATE', key: string, groupName: string, id: string, mkStream?: 'MKSTREAM'): Promise<boolean> {
    if (mkStream === 'MKSTREAM') {
      try {
        return (await this.redisClient.xgroup(command, key, groupName, id, mkStream)) === 'OK';
      } catch (err) {
        this.logger.warn(`Consumer group not created with MKSTREAM for key: ${key} and group: ${groupName}`, err);
        throw err;
      }
    } else {
      try {
        return (await this.redisClient.xgroup(command, key, groupName, id)) === 'OK';
      } catch (err) {
        this.logger.warn(`Consumer group not created for key: ${key} and group: ${groupName}`, err);
        throw err;
      }
    }
  }

  async xadd(key: string, id: string, ...args: string[]): Promise<string> {
    try {
      return await this.redisClient.xadd(key, id, ...args);
    } catch (err) {
      this.logger.error(`Error publishing 'xadd'; key: ${key}`, err);
      throw err;
    }
  }

  async xreadgroup(
    command: 'GROUP',
    groupName: string,
    consumerName: string,
    blockOption: 'BLOCK'|'COUNT',
    blockTime: number|string,
    streamsOption: 'STREAMS',
    streamName: string,
    id: string
  ): Promise<string[][][] | null | unknown[]> {
    try {
      //@ts-ignore
      return await this.redisClient.xreadgroup(
        command,
        groupName,
        consumerName,
        // @ts-ignore
        blockOption,
        blockTime,
        streamsOption,
        streamName,
        id
      );
    } catch (err) {
      this.logger.error(`Error reading stream data [Stream ${streamName}] [Group ${groupName}]`, err);
      throw err;
    }
  }

  async xpending(
    key: string,
    group: string,
    start?: string,
    end?: string,
    count?: number,
    consumer?: string
  ): Promise<[string, string, number, [string, number][]][] | [string, string, number, number] | unknown[]> {
    try {
      const args = [key, group];
      if (start) args.push(start);
      if (end) args.push(end);
      if (count !== undefined) args.push(count.toString());
      if (consumer) args.push(consumer);
      try {
        return await this.redisClient.call('XPENDING', ...args) as [string, string, number, number][];
      } catch (err) {
        console.log('err, args', err, args);
      }
    } catch (err) {
      this.logger.error(`Error in retrieving pending messages for [stream ${key}], [group ${group}]`, err);
      throw err;
    }
  }

  async xclaim(
    key: string,
    group: string,
    consumer: string,
    minIdleTime: number,
    id: string,
    ...args: string[]
  ): Promise<[string, string][] | unknown[]> {
    try {
      return await this.redisClient.xclaim(key, group, consumer, minIdleTime, id, ...args);
    } catch (err) {
      this.logger.error(`Error in claiming message with id: ${id} in group: ${group} for key: ${key}`, err);
      throw err;
    }
  }

  async xack(key: string, group: string, id: string, multi? : RedisMultiType): Promise<number|RedisMultiType> {
    try {
      return await (multi || this.redisClient).xack(key, group, id);
    } catch (err) {
      this.logger.error(`Error in acknowledging messages in group: ${group} for key: ${key}`, err);
      throw err;
    }
  }

  async xdel(key: string, id: string, multi? : RedisMultiType): Promise<number|RedisMultiType> {
    try {
      return await (multi || this.redisClient).xdel(key, id);
    } catch (err) {
      this.logger.error(`Error in deleting messages with id: ${id} for key: ${key}`, err);
      throw err;
    }
  }
}

export { IORedisStreamService };
