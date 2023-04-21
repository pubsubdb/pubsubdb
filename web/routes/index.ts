import { FastifyInstance } from 'fastify';
import { GetStatsOptions } from '../../typedefs/stats';
import { PubSubDB } from '../../index';
import { Params, Query, Body } from '../../typedefs/http';

export const registerAppRoutes = (server: FastifyInstance, pubSubDB: PubSubDB) => {

  server.post<{ Params: Params; Body: Body; QueryString: Query }>('/v1/topics/:topic', async (request, reply) => {
    return await pubSubDB.pub(request.params.topic, request.body);
  });

  server.get<{ Querystring: Query }>('/v1/stats', async (request, reply) => {
    const options: GetStatsOptions = request.query as unknown as GetStatsOptions;
    return await pubSubDB.getStats(options);
  });

  server.get<{ Params: Params }>('/v1/jobs/:job_id', async (request, reply) => {
    return await pubSubDB.get(request.params.job_id);
  });
};
