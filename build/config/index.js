"use strict";
// config/index.ts
Object.defineProperty(exports, "__esModule", { value: true });
const env = process.env.NODE_ENV || 'development';
const baseConfig = {
    REDIS_DATABASE: 0,
};
const envConfig = {
    development: require('./development').default,
    test: require('./test').default,
    staging: require('./staging').default,
    production: require('./production').default,
};
exports.default = { ...baseConfig, ...envConfig[env] };
