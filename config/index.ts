// config/index.ts

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

export default { ...baseConfig, ...envConfig[env] };
