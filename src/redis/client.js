const Redis = require('ioredis');
const config = require('../config');
const logger = require('../logger');

/**
 * Tạo một Redis client mới (lazy connect).
 * Sử dụng cho cả subscriber và publisher riêng biệt.
 */
function createRedisClient() {
  const client = new Redis({
    host: config.redisHost,
    port: config.redisPort,
    password: config.redisPassword,
    db: config.redisDb,
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });

  client.on('error', (error) => {
    logger.error('Redis client error', { error: error.message });
  });

  client.on('connect', () => {
    logger.info('Redis client connected');
  });

  client.on('reconnecting', () => {
    logger.warn('Redis client reconnecting...');
  });

  return client;
}

module.exports = { createRedisClient };
