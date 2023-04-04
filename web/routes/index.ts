import { FastifyInstance } from 'fastify';
import { AppService } from '../../services/app';
import { App } from '../../typedefs/app';

export const registerAppRoutes = (server: FastifyInstance) => {
  server.post('/v1/apps', async (request, reply) => {
    const app = await AppService.create(request.body as App);
    return app;
  });
};
