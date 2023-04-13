"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAppRoutes = void 0;
const app_1 = require("../../services/app");
const registerAppRoutes = (server) => {
    server.post('/v1/apps', async (request, reply) => {
        const app = await app_1.AppService.create(request.body);
        return app;
    });
};
exports.registerAppRoutes = registerAppRoutes;
