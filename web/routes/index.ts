import { FastifyInstance } from 'fastify';

export const registerAppRoutes = (server: FastifyInstance) => {
  server.post('/v1/apps', async (request, reply) => {
    return {};
  });
};
