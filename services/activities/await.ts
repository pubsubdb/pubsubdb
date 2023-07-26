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
import { StreamCode, StreamStatus } from '../../types/stream';
import { Span, SpanStatusCode } from '../../types/telemetry';

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
    let span: Span;
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

      await this.execActivity();
      return this.context.metadata.aid;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      if (error instanceof GetStateError) {
        this.logger.error('await-get-state-error', error);
      } else {
        this.logger.error('await-process-error', error);
      }
      throw error;
    } finally {
      //todo: inject attribute with the spawned job id
      this.endSpan(span);
    }
  }

  async execActivity(): Promise<void> {
    const context: JobState = { 
      data: this.context.data,
      metadata: { 
        ...this.context.metadata,
        ngn: undefined,
        pj: this.context.metadata.jid,
        pa: this.metadata.aid,
        trc: this.context.metadata.trc,
        spn: this.context['$self'].output.metadata?.l1s,
      }
    };
    //todo: publish to stream (xadd)
    await this.engine.pub(
      this.config.subtype,
      this.context.data,
      context
    );
  }


  //********  `RESOLVE` ENTRY POINT (B)  ********//
  //this method is invoked when the job spawned by this job ends;
  //`this.data` is the job data produced by the spawned job
  async resolveAwait(status: StreamStatus = StreamStatus.SUCCESS, code: StreamCode = 200): Promise<void> {
    this.setDuplexLeg(2);
    const jid = this.context.metadata.jid;
    const aid = this.metadata.aid;
    if (!jid) {
      throw new Error('service/activities/await:resolveAwait: missing jid in job context');
    }
    this.logger.debug('await-onresponse-started', { jid, aid, status, code });
    this.status = status;
    this.code = code;
    let span: Span;
    try {
      await this.getState();
      span = this.startSpan();
      let multiResponse: MultiResponseFlags = [];
      if (status === StreamStatus.SUCCESS) {
        multiResponse = await this.processSuccess();
      } else {
        multiResponse = await this.processError();
      }
      const activityStatus = multiResponse[multiResponse.length - 1];
      const isComplete = CollatorService.isJobComplete(activityStatus as number);
      this.transition(isComplete);
    } catch (error) {
      this.logger.error('await-resolve-await-error', error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      throw error;
    } finally {
      this.endSpan(span);
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
