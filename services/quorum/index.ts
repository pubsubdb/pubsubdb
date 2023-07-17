import { KeyType } from '../../modules/key';
import { sleepFor } from '../../modules/utils';
import { CompilerService } from '../compiler';
import { EngineService } from '../engine';
import { ILogger } from '../logger';
import { StoreService } from '../store';
import { SubService } from '../sub';
import { CacheMode } from '../../types/cache';
import {
  QuorumMessage,
  QuorumMessageCallback,
  RollCallMessage,
  SubscriptionCallback,
  ThrottleMessage
} from '../../types/quorum';
import { PubSubDBApps, PubSubDBConfig } from '../../types/pubsubdb';
import { RedisClient, RedisMulti } from '../../types/redis';

//wait time to see if quorum is reached
const QUORUM_DELAY = 250;

class QuorumService {
  namespace: string;
  apps: PubSubDBApps | null;
  appId: string;
  guid: string;
  engine: EngineService;
  store: StoreService<RedisClient, RedisMulti> | null;
  subscribe: SubService<RedisClient, RedisMulti> | null;
  logger: ILogger;
  cacheMode: CacheMode = 'cache';
  untilVersion: string | null = null;
  quorum: number | null = null;
  callbacks: QuorumMessageCallback[] = [];

  static async init(
    namespace: string,
    appId: string,
    guid: string,
    config: PubSubDBConfig,
    engine: EngineService,
    logger: ILogger
  ): Promise<QuorumService> {
    //quorum piggybacks on the `engine` config, resusing the `store` and `sub` interfaces
    if (config.engine) {
      const instance = new QuorumService();
      //verify and set namespace, appId, and guid
      instance.verifyQuorumFields(config);
      instance.namespace = namespace;
      instance.appId = appId;
      instance.guid = guid;
      instance.logger = logger;
      instance.engine = engine;
      //initialize the `store` client (read/write data)
      instance.store = config.engine.store;
      instance.apps = await instance.store.init(
        instance.namespace,
        instance.appId,
        instance.logger,
      );
      //initialize the `sub` client
      instance.subscribe = config.engine.sub;
      await instance.subscribe.init(
        instance.namespace,
        instance.appId,
        instance.guid,
        instance.logger
      );
      //general quorum subscription
      await instance.subscribe.subscribe(KeyType.QUORUM, instance.subscriptionHandler(), appId);
      //app-specific quorum subscription (used for pubsub one-time request/response)
      await instance.subscribe.subscribe(KeyType.QUORUM, instance.subscriptionHandler(), appId, instance.guid);
      //tell engine to check for open `hook` tasks
      instance.engine.processWebHooks();
      //tell engine to check for time-trigger events (awaken, expire, cron, etc.)
      instance.engine.processTimeHooks();
      return instance;
    }
  }

  verifyQuorumFields(config: PubSubDBConfig) {
    if (!(config.engine.store instanceof StoreService) || 
      !(config.engine.sub instanceof SubService)) {
      throw new Error('quorum config must include `store` and `sub` fields.');
    }
  }

  subscriptionHandler(): SubscriptionCallback {
    const self = this;
    return async (topic: string, message: QuorumMessage) => {
      self.logger.debug('quorum-event-received', { topic, type: message.type});
      if (message.type === 'activate') {
        self.engine.setCacheMode(message.cache_mode, message.until_version);
      } else if (message.type === 'ping') {
        this.sayPong(self.appId, self.guid, message.originator);
      } else if (message.type === 'pong' && self.guid === message.originator) {
        self.quorum = self.quorum + 1;
      } else if (message.type === 'rollcall') {
        self.engine.report();
      } else if (message.type === 'throttle') {
        self.engine.throttle(message.throttle);
      } else if (message.type === 'work') {
        self.engine.processWebHooks()
      } else if (message.type === 'job') {
        self.engine.routeToSubscribers(message.topic, message.job)
      }
      //if there are any callbacks, call them
      if (self.callbacks.length > 0) {
        self.callbacks.forEach(cb => cb(topic, message));
      }
    };
  }

  async sayPong(appId: string, guid: string, originator: string) {
    this.store.publish(
      KeyType.QUORUM, 
      { type: 'pong', guid, originator },
      appId,
    );
  }

  async requestQuorum(delay = QUORUM_DELAY): Promise<number> {
    const quorum = this.quorum;
    this.quorum = 0;
    await this.store.publish(
      KeyType.QUORUM,
      { type: 'ping', originator: this.guid },
      this.appId,
    );
    await sleepFor(delay);
    return quorum;
  }


  // ************* PUB/SUB METHODS *************
  //publish a message to the quorum
  async pub(quorumMessage: ThrottleMessage | RollCallMessage) {
    return await this.store.publish(KeyType.QUORUM, quorumMessage, this.appId, quorumMessage.topic || quorumMessage.guid);
  }
  //subscribe user to quorum messages
  async sub(callback: QuorumMessageCallback): Promise<void> {
    //the quorum is always subscribed to the `quorum` topic; just register the fn
    this.callbacks.push(callback);
  }
  //unsubscribe user from quorum messages
  async unsub(callback: QuorumMessageCallback): Promise<void> {
    //the quorum is always subscribed to the `quorum` topic; just unregister the fn
    this.callbacks = this.callbacks.filter(cb => cb !== callback);
  }


  // ************* COMPILER METHODS *************
  async activate(version: string, delay = QUORUM_DELAY): Promise<boolean> {
    version = version.toString();
    const config = await this.engine.getVID();
    //request a quorum to activate the version
    await this.requestQuorum(delay);
    const q1 = await this.requestQuorum(delay);
    const q2 = await this.requestQuorum(delay);
    const q3 = await this.requestQuorum(delay);
    if (q1 && q1 === q2 && q2 === q3) {
      this.logger.info('quorum-rollcall-succeeded', { q1, q2, q3 });
      this.store.publish(
        KeyType.QUORUM,
        { type: 'activate', cache_mode: 'nocache', until_version: version },
        this.appId
      );
      await new Promise(resolve => setTimeout(resolve, delay));
      //confirm we received the activation message
      if (this.engine.untilVersion === version) {
        this.logger.info('quorum-activation-succeeded', { version });
        const { id } = config;
        const compiler = new CompilerService(this.store, this.logger);
        return await compiler.activate(id, version);
      } else {
        this.logger.error('quorum-activation-failed', { version });
        throw new Error(`UntilVersion Not Received. Version ${version} not activated`);
      }
    } else {
      this.logger.info('quorum-rollcall-failed', { q1, q2, q3 });
      throw new Error(`Quorum not reached. Version ${version} not activated.`);
    }
  }
}

export { QuorumService }
