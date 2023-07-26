import { GetStateError } from '../../modules/errors';
import { Activity } from './activity';
import { CollatorService } from '../collator';
import { EngineService } from '../engine';
import {
  ActivityData,
  ActivityMetadata,
  WorkerActivity,
  ActivityType } from '../../types/activity';
import { JobState } from '../../types/job';
import { MultiResponseFlags } from '../../types/redis';
import {
  StreamCode,
  StreamData,
  StreamStatus } from '../../types/stream';
import { Span, SpanStatusCode } from '../../types/telemetry';

class Worker extends Activity {
  config: WorkerActivity;

  constructor(
    config: ActivityType,
    data: ActivityData,
    metadata: ActivityMetadata,
    hook: ActivityData | null,
    engine: EngineService,
    context?: JobState) {
      super(config, data, metadata, hook, engine, context);
  }

  //********  INITIAL ENTRY POINT (A)  ********//
  async process(): Promise<string> {
    let span: Span
    try {
      this.setDuplexLeg(1);
      await this.getState();
      span = this.startSpan();
      this.mapInputData();

      const multi = this.store.getMulti();
      //await this.registerTimeout();
      await this.setState(multi);
      await this.setStatus(1, multi);
      await multi.exec();

      const messageId = await this.execActivity();
      span.setAttribute('app.activity.mid', messageId);
      return this.context.metadata.aid;
    } catch (error) {
      if (error instanceof GetStateError) {
        this.logger.error('worker-get-state-error', error);
      } else {
        this.logger.error('worker-process-error', error);
      }
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      throw error;
    } finally {
      this.endSpan(span);
    }
  }

  async execActivity(): Promise<string> {
    const streamData: StreamData = {
      metadata: {
        jid: this.context.metadata.jid,
        aid: this.metadata.aid,
        topic: this.config.subtype,
        spn: this.context['$self'].output.metadata.l1s,
        trc: this.context.metadata.trc,
      },
      data: this.context.data
    };
    if (this.config.retry) {
      streamData.policies = {
        retry: this.config.retry
      };
    }
    return await this.engine.streamSignaler?.publishMessage(this.config.subtype, streamData);
  }


  //********  RE-ENTRY POINT (DUPLEX LEG 2 of 2)  ********//
  async processWorkerEvent(status: StreamStatus = StreamStatus.SUCCESS, code: StreamCode = 200): Promise<void> {
    this.setDuplexLeg(2);
    const jid = this.context.metadata.jid;
    const aid = this.metadata.aid;
    this.status = status;
    this.code = code;
    this.logger.debug('engine-process-worker-event', { jid, aid, topic: this.config.subtype });
    let span: Span;
    try {
      await this.getState();
      span = this.startSpan();
      let isComplete = CollatorService.isActivityComplete(this.context.metadata.js, this.config.collationInt as number);
      if (isComplete) {
        this.logger.warn('worker-onresponse-duplicate', { jid, aid, status, code });
        this.logger.debug('worker-onresponse-duplicate-resolution', { resolution: 'Increase PubSubDB config `xclaim` timeout.' });
        return; //ok to return early here (due to xclaimed intercept completing first)
      }
      let multiResponse: MultiResponseFlags = [];
      if (status === StreamStatus.PENDING) {
        await this.processPending();
      } else {
        multiResponse = status === StreamStatus.SUCCESS ?
          await this.processSuccess():
          await this.processError();
        const activityStatus = multiResponse[multiResponse.length - 1];
        isComplete = CollatorService.isJobComplete(activityStatus as number);
        this.transition(isComplete);
      }
    } catch (error) {
      this.logger.error('worker-process-worker-event-error', error);
      throw error;
    } finally {
      this.endSpan(span);
    }
  }

  async processPending(): Promise<MultiResponseFlags> {
    this.bindActivityData('output');
    this.mapJobData();
    const multi = this.store.getMulti();
    await this.setState(multi);
    return await multi.exec() as MultiResponseFlags;
  }

  async processSuccess(): Promise<MultiResponseFlags> {
    this.bindActivityData('output');
    this.mapJobData();
    const multi = this.store.getMulti();
    await this.setState(multi);
    await this.setStatus(2, multi);
    return await multi.exec() as MultiResponseFlags;
  }

  async processError(): Promise<MultiResponseFlags> {
    this.bindActivityError(this.data);
    const multi = this.store.getMulti();
    await this.setState(multi);
    await this.setStatus(1, multi);
    return await multi.exec() as MultiResponseFlags;
  }
}

export { Worker };
