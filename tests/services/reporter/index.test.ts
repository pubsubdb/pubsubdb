import { ReporterService } from '../../../services/reporter';
import { ILogger } from '../../../services/logger';
import { IORedisStoreService as IORedisStore } from '../../../services/store/stores/ioredis';
import { RedisClientType, RedisConnection } from '../../../cache/ioredis';
import { JobStatsRange } from '../../../typedefs/stats';
import { PSNS } from '../../../services/store/key';

// Mock the IORedisStoreService class
jest.mock('../../../services/store/stores/ioredis', () => {
  return {
    IORedisStoreService: jest.fn().mockImplementation(() => {
      return {
        getJobStats: jest.fn(),
      };
    }),
  };
});

const getTimeSeriesStamp = (granularity = '5m', minutesInThePast = 0): string => {
  const _now = new Date();
  //add minutes if provided
  const now = new Date(_now.getTime() - (minutesInThePast * 60 * 1000));
  const granularityUnit = granularity.slice(-1);
  const granularityValue = parseInt(granularity.slice(0, -1), 10);
  if (granularityUnit === 'm') {
    const minute = Math.floor(now.getMinutes() / granularityValue) * granularityValue;
    now.setUTCMinutes(minute, 0, 0);
  } else if (granularityUnit === 'h') {
    now.setUTCMinutes(0, 0, 0);
  }
  return now.toISOString().replace(/:\d\d\..+|-|T/g, '').replace(':','');
};

describe('ReporterService', () => {
  const CONNECTION_KEY = 'manual-test-connection';
  const appId = 'test-app';
  const appVersion = '1';
  let reporter: ReporterService;
  let redisConnection: RedisConnection;
  let redisClient: RedisClientType;
  let redisStore: IORedisStore;

  const logger: ILogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  beforeAll(async () => {
    //set up the redis connection
    redisConnection = await RedisConnection.getConnection(CONNECTION_KEY);
    redisClient = await redisConnection.getClient();
    redisClient.flushdb();
    redisStore = new IORedisStore(redisClient);
  });

  beforeEach(() => {
    jest.resetAllMocks();
    reporter = new ReporterService(appId, appVersion, redisStore, logger);
  });

  afterAll(async () => {
    await RedisConnection.disconnectAll();
  });

  describe('getStats()', () => {
    it('should return correct stats for given options', async () => {
      const options = {
        key: 'widgetB',
        granularity: '5m',
        range: '1h',
        end: 'NOW',
      };

      const sampleRedisData: JobStatsRange = {
        [`${PSNS}:${appId}:s:${options.key}:${getTimeSeriesStamp(options.granularity, 10)}`]: {
          'count': 25,
          'count:scf:12315': 5,
          'count:ndc:12145': 5,
          'count:scf:12335': 5,
          'count:ndc:12345': 5,
          'count:scf:12355': 5,
          'count:ndc:12545': 5,
          'count:scf:12375': 5,
          'count:ndc:12745': 5,
          'count:scf:12395': 5,
          'count:ndc:12945': 5,
        },
        [`${PSNS}:${appId}:s:${options.key}:${getTimeSeriesStamp(options.granularity)}`]: {
          'count': 15,
          'count:scf:12315': 5,
          'count:ndc:12145': 4,
          'count:scf:12335': 3,
          'count:ndc:12345': 2,
          'count:scf:12355': 1,
          'count:ndc:12545': 5,
          'count:scf:12375': 4,
          'count:ndc:12745': 3,
          'count:scf:12395': 2,
          'count:ndc:12945': 1,
        },
      };

      (redisStore.getJobStats as jest.Mock).mockResolvedValue(sampleRedisData);
      const stats = await reporter.getStats(options);
      expect(stats.key).toBe(options.key);
      expect(stats.granularity).toBe(options.granularity);
      expect(stats.range).toBe(options.range);
      expect(stats.end).toBe(options.end);
    });
  });
});
