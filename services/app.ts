import { RedisConnection } from '../cache/redis';
import { App } from '../typedefs/app';

class AppService {
  async create(appData: App): Promise<App> {
    try {
      const redisConnection = await RedisConnection.getConnection('test-connection');
      console.log('Connection established:', redisConnection);
      const redisClient = await redisConnection.getClient();
      const { name, title } = appData;
      const isSet = await redisClient.hSetNX(name, 'title', title);
      if (!isSet) {
        throw new Error(`App with name "${name}" already exists.`);
      }
      return appData;
    } catch (error) {
      console.error('Error in AppService.create():', error);
      throw error;
    }
  }
}

const appServiceInstance = new AppService();
export { appServiceInstance as AppService };
