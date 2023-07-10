import { KeyType } from "../../modules/key";
import { ILogger } from "../logger";
import { StreamSignaler } from "../signaler/stream";
import { StreamService } from "../stream";
import { StoreService } from "../store";
import { SubService } from "../sub";
import { PubSubDBConfig, PubSubDBWorker } from "../../types/pubsubdb";
import {
  QuorumMessage,
  ReportMessage,
  SubscriptionCallback } from "../../types/quorum";
import { RedisClient, RedisMulti } from "../../types/redis";
import { StreamRole } from "../../types/stream";

const REPORT_INTERVAL = 10000;

class WorkerService {
  namespace: string;
  appId: string;
  guid: string;
  topic: string;
  config: PubSubDBConfig;
  store: StoreService<RedisClient, RedisMulti> | null;
  stream: StreamService<RedisClient, RedisMulti> | null;
  subscribe: SubService<RedisClient, RedisMulti> | null;
  streamSignaler: StreamSignaler | null;
  logger: ILogger;
  reporting = false;

  static async init(
    namespace: string,
    appId: string,
    guid: string,
    config: PubSubDBConfig,
    logger: ILogger
  ): Promise<WorkerService[]> {
    const services: WorkerService[] = [];
    if (Array.isArray(config.workers)) {
      for (const worker of config.workers) {
        //initialize and verify worker config
        const service = new WorkerService();
        service.verifyWorkerFields(worker);
        service.namespace = namespace;
        service.appId = appId;
        service.guid = guid;
        service.topic = worker.topic;
        service.config = config;
        service.logger = logger;
        //init `store` interface (for publishing responses to the buffer)
        service.store = worker.store;
        await worker.store.init(
          service.namespace,
          service.appId,
          logger
        );
        //initialize the `sub` client (only types in subscriptionHandler are reacted to)
        service.subscribe = worker.sub;
        await worker.sub.init(
          service.namespace,
          service.appId,
          service.guid,
          service.logger
        );
        //general quorum subscription (to receive all quorum messages)
        await service.subscribe.subscribe(KeyType.QUORUM, service.subscriptionHandler(), appId);
        //worker-specific targeting (for quorum messages targeting this worker's topic)
        await service.subscribe.subscribe(KeyType.QUORUM, service.subscriptionHandler(), appId, service.topic);
        //app-specific quorum subscription (used for pubsub one-time request/response)
        await service.subscribe.subscribe(KeyType.QUORUM, service.subscriptionHandler(), appId, service.guid);
        //init `stream` interface (for consuming buffered messages)
        service.stream = worker.stream;
        await worker.stream.init(
          service.namespace,
          service.appId,
          logger
        );
        //start consuming messages (this is a blocking call; never use worker.stream for anything else!)
        const key = worker.stream.mintKey(KeyType.STREAMS, { appId: service.appId, topic: worker.topic });
        service.streamSignaler = new StreamSignaler(
          {
            namespace: service.namespace,
            appId: service.appId,
            guid: service.guid,
            role: StreamRole.WORKER,
            topic: worker.topic,
            xclaim: worker.xclaim,
          },
          worker.stream,
          worker.store,
          logger
        );
        await service.streamSignaler.consumeMessages(
          key,
          'WORKER',
          service.guid,
          worker.callback
        );
        services.push(service);
      }
    }
    return services;
  }

  verifyWorkerFields(worker: PubSubDBWorker) {
    if (!(worker.store instanceof StoreService) || 
      !(worker.stream instanceof StreamService) ||
      !(worker.sub instanceof SubService) ||
      !(worker.topic && worker.callback)) {
      throw new Error('worker must include `store`, `stream`, and `sub` fields along with a callback function and topic.');
    }
  }

  subscriptionHandler(): SubscriptionCallback {
    const self = this;
    return async (topic: string, message: QuorumMessage) => {
      self.logger.debug('worker-event-received', { topic, type: message.type });
      if (message.type === 'rollcall') {
        self.report();
      } else if (message.type === 'throttle') {
        self.throttle(message.throttle);
      }
    };
  }

  async report() {
    const message: ReportMessage = {
      type: 'report',
      profile: this.streamSignaler.report(),
    };
    await this.store.publish(KeyType.QUORUM, message, this.appId);
    if (!this.reporting) {
      this.reporting = true;
      setTimeout(this.reportNow.bind(this), REPORT_INTERVAL);
    }
  }

  async reportNow(once: boolean = false) {
    try {
      const message: ReportMessage = {
        type: 'report',
        profile: this.streamSignaler.reportNow(),
      };
      await this.store.publish(KeyType.QUORUM, message, this.appId);
      if (!once) {
        setTimeout(this.reportNow.bind(this), REPORT_INTERVAL);
      }
    } catch (err) {
      this.logger.error('worker-report-now-failed', err);
    }
  }

  async throttle(delayInMillis: number) {
    this.streamSignaler.setThrottle(delayInMillis);
  }
}

export { WorkerService };
