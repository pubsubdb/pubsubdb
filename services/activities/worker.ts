import { GetStateError } from '../../modules/errors';
import { Activity } from './activity';
import { CollatorService } from '../collator';
import { EngineService } from '../engine';
import {
  ActivityData,
  ActivityMetadata,
  ActivityType,
  WorkerActivity } from '../../types/activity';
import { JobState } from '../../types/job';
import { MultiResponseFlags } from '../../types/redis';
import {
  StreamCode,
  StreamData,
  StreamStatus } from '../../types/stream';
import { TelemetryService } from '../telemetry';

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
    let telemetry: TelemetryService;
    try {
      this.setLeg(1);
      await this.getState();
      telemetry = new TelemetryService(this.engine.appId, this.config, this.metadata, this.context);
      telemetry.startActivitySpan(this.leg);
      this.mapInputData();

      const multi = this.store.getMulti();
      //await this.registerTimeout();
      await this.setState(multi);
      await this.setStatus(1, multi);
      const multiResponse = await multi.exec() as MultiResponseFlags;

      telemetry.mapActivityAttributes();
      const activityStatus = multiResponse[multiResponse.length - 1];
      const messageId = await this.execActivity();
      telemetry.setActivityAttributes({
        'app.activity.mid': messageId,
        'app.job.jss': activityStatus as number - 0
      });
      return this.context.metadata.aid;
    } catch (error) {
      if (error instanceof GetStateError) {
        this.logger.error('worker-get-state-error', error);
      } else {
        this.logger.error('worker-process-error', error);
      }
      telemetry.setActivityError(error.message);
      throw error;
    } finally {
      telemetry.endActivitySpan();
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
    this.setLeg(2);
    const jid = this.context.metadata.jid;
    const aid = this.metadata.aid;
    this.status = status;
    this.code = code;
    this.logger.debug('engine-process-worker-event', { jid, aid, topic: this.config.subtype });
    let telemetry: TelemetryService;
    try {
      await this.getState();
      telemetry = new TelemetryService(this.engine.appId, this.config, this.metadata, this.context);
      telemetry.startActivitySpan(this.leg);
      let isComplete = CollatorService.isActivityComplete(this.context.metadata.js, this.config.collationInt as number);
      if (isComplete) {
        this.logger.warn('worker-onresponse-duplicate', { jid, aid, status, code });
        this.logger.debug('worker-onresponse-duplicate-resolution', { resolution: 'Increase PubSubDB config `xclaim` timeout.' });
        return; //ok to return early here (due to xclaimed claimaint completing first)
      }

      if (status === StreamStatus.PENDING) {
        await this.processPending();
        telemetry.mapActivityAttributes();
        telemetry.setActivityAttributes({ 'app.job.jss': Number(this.context.metadata.js) });
      } else {
        const multiResponse = status === StreamStatus.SUCCESS ?
          await this.processSuccess():
          await this.processError();
        telemetry.mapActivityAttributes();
        const activityStatus = multiResponse[multiResponse.length - 1];
        telemetry.setActivityAttributes({ 'app.job.jss': activityStatus as number - 0 });
        isComplete = CollatorService.isJobComplete(activityStatus as number);
        this.transition(isComplete);
      }
    } catch (error) {
      this.logger.error('worker-process-worker-event-error', error);
      telemetry.setActivityError(error.message);
      throw error;
    } finally {
      telemetry.endActivitySpan();
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
