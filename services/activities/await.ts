import { GetStateError } from '../../modules/errors';
import { Activity } from './activity';
import { CollatorService } from '../collator';
import { EngineService } from '../engine';
import {
  ActivityData,
  ActivityMetadata,
  AwaitActivity,
  ActivityType } from '../../types/activity';
import { JobState } from '../../types/job';
import { MultiResponseFlags } from '../../types/redis';
import { StreamCode, StreamData, StreamDataType, StreamStatus } from '../../types/stream';
import { TelemetryService } from '../telemetry';

class Await extends Activity {
  config: AwaitActivity;

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
      telemetry.setActivityError(error.message);
      if (error instanceof GetStateError) {
        this.logger.error('await-get-state-error', error);
      } else {
        this.logger.error('await-process-error', error);
      }
      throw error;
    } finally {
      //todo: inject attribute with the spawned job id
      telemetry.endActivitySpan();
    }
  }


  async execActivity(): Promise<string> {
    const streamData: StreamData = {
      metadata: {
        jid: this.context.metadata.jid,
        aid: this.metadata.aid,
        topic: this.config.subtype,
        spn: this.context['$self'].output.metadata?.l1s,
        trc: this.context.metadata.trc,
      },
      type: StreamDataType.AWAIT,
      data: this.context.data
    };
    if (this.config.retry) {
      streamData.policies = {
        retry: this.config.retry
      };
    }
    return await this.engine.streamSignaler?.publishMessage(null, streamData);
  }


  //********  `RESOLVE` ENTRY POINT (B)  ********//
  //this method is invoked when the job spawned by this job ends;
  //`this.data` is the job data produced by the spawned job
  async resolveAwait(status: StreamStatus = StreamStatus.SUCCESS, code: StreamCode = 200): Promise<void> {
    this.setLeg(2);
    const jid = this.context.metadata.jid;
    const aid = this.metadata.aid;
    if (!jid) {
      throw new Error('service/activities/await:resolveAwait: missing jid in job context');
    }
    this.logger.debug('await-onresponse-started', { jid, aid, status, code });
    this.status = status;
    this.code = code;
    let telemetry: TelemetryService;
    try {
      await this.getState();
      telemetry = new TelemetryService(this.engine.appId, this.config, this.metadata, this.context);
      telemetry.startActivitySpan(this.leg);
      let multiResponse: MultiResponseFlags = [];
      if (status === StreamStatus.SUCCESS) {
        multiResponse = await this.processSuccess();
      } else {
        multiResponse = await this.processError();
      }

      telemetry.mapActivityAttributes();
      const activityStatus = multiResponse[multiResponse.length - 1];
      telemetry.setActivityAttributes({ 'app.job.jss': activityStatus as number - 0 });
      const isComplete = CollatorService.isJobComplete(activityStatus as number);
      this.transition(isComplete);
    } catch (error) {
      this.logger.error('await-resolve-await-error', error);
      telemetry.setActivityError(error.message);
      throw error;
    } finally {
      telemetry.endActivitySpan();
    }
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

export { Await };
