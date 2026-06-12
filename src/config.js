const dotenv = require('dotenv');

dotenv.config();

module.exports = {
  port: Number(process.env.PORT || 3001),
  host: process.env.HOST || '0.0.0.0',
  redisHost: process.env.REDIS_HOST || '127.0.0.1',
  redisPort: Number(process.env.REDIS_PORT || 6379),
  redisPassword: process.env.REDIS_PASSWORD || undefined,
  redisDb: Number(process.env.REDIS_DB || 0),
  redisChannel: process.env.REDIS_CHANNEL || 'ride.tracking.events',
  redisCommunicationChannel: process.env.REDIS_COMMUNICATION_CHANNEL || 'ride.communication.events',
  redisFinanceChannel: process.env.REDIS_FINANCE_CHANNEL || 'finance.events',
  corsOrigins: (process.env.CORS_ORIGINS || '*')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
  locationStaleAfterMs: Number(process.env.LOCATION_STALE_AFTER_MS || 45000),
  staleSweepIntervalMs: Number(process.env.STALE_SWEEP_INTERVAL_MS || 15000),
};
