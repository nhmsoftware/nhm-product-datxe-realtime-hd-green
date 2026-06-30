const config = require('../config');
const logger = require('../logger');
const { createRedisClient } = require('./client');

/**
 * Tạo subscriber Redis và đăng ký lắng nghe tất cả các kênh.
 * Khi nhận được message, gọi handler(channel, payload) để xử lý.
 *
 * @param {Function} onMessage - Hàm callback (channel, payload) => void
 * @returns {Promise<Redis>} subscriber client
 */
async function createSubscriber(onMessage) {
  const subscriber = createRedisClient();

  await subscriber.connect();

  await subscriber.subscribe(
    config.redisChannel,
    config.redisCommunicationChannel,
    config.redisFinanceChannel,
  );

  logger.info('Redis subscriber ready', {
    trackingChannel: config.redisChannel,
    communicationChannel: config.redisCommunicationChannel,
    financeChannel: config.redisFinanceChannel,
  });

  subscriber.on('message', (channel, rawPayload) => {
    let payload;
    try {
      payload = JSON.parse(rawPayload);
    } catch (err) {
      logger.error('Redis subscriber: failed to parse payload', {
        channel,
        error: err.message,
        rawPayload: rawPayload?.slice(0, 200),
      });
      return;
    }

    logger.info('Redis subscriber: message received', {
      channel,
      event: payload?.event || payload?.data?.event || 'unknown',
      ride_id: payload?.ride_id || payload?.data?.ride_id || null,
      user_id: payload?.user_id || payload?.data?.user_id || null,
    });

    onMessage(channel, payload);
  });

  return subscriber;
}

module.exports = { createSubscriber };
