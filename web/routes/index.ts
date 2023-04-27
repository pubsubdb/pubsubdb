import { FastifyInstance } from 'fastify';
import { JobStatsInput, GetStatsOptions } from '../../typedefs/stats';
import { PubSubDB } from '../../index';
import { Params, Query, Body } from '../../typedefs/http';

export const registerAppRoutes = (server: FastifyInstance, pubSubDB: PubSubDB) => {

  server.post<{ Params: Params; Body: Body; QueryString: Query }>('/v1/topics/:topic', async (request, reply) => {
    return await pubSubDB.pub(request.params.topic, request.body);
  });

  server.post<{ Params: Params; Body: Body }>('/v1/stats/general/:topic', async (request, reply) => {
    const jobStats: JobStatsInput = {
      data: request.body.data as unknown as Record<string, unknown>,
      start: request.body.start,
      end: request.body.end,
      range: request.body.range,
    }
    return await pubSubDB.getStats(request.params.topic, jobStats);
  });

  server.post<{ Params: Params; Body: Body }>('/v1/stats/index/:topic', async (request, reply) => {
    const jobStats: JobStatsInput = {
      data: request.body.data as unknown as Record<string, unknown>,
      start: request.body.start,
      end: request.body.end,
      range: request.body.range,
    }
    return await pubSubDB.getIds(request.params.topic, jobStats, request.body.facets as unknown as string[]);
  });

  server.get<{ Params: Params }>('/v1/jobs/:job_id', async (request, reply) => {
    return await pubSubDB.get(request.params.job_id);
  });
};
