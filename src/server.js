const { Server } = require('socket.io');

const config = require('./config');
const logger = require('./logger');

const { createHttpServer } = require('./http/healthServer');
const { attachSocketHandlers } = require('./socket/handlers');
const { createSubscriber } = require('./redis/subscriber');
const { getRideRoom, getUserRoom, getUserRoomDot, getWalletRoom } = require('./socket/roomManager');
const {
  rememberTrackingState,
  clearTrackingState,
  getAllStates,
  buildStalePayload,
} = require('./socket/trackingState');

// ─────────────────────────────────────────────────────────────────────────────
// Redis message dispatcher — nhận message từ subscriber, định tuyến vào rooms
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Xử lý một message đến từ bất kỳ kênh Redis nào.
 * Định tuyến message tới đúng room Socket.io dựa trên channel và nội dung payload.
 *
 * @param {import('socket.io').Server} io
 * @param {string} channel
 * @param {object} payload
 */
function dispatchRedisMessage(io, channel, payload) {
  const eventData = payload.data || payload;
  const userId =
    eventData.user_id ||
    eventData.notifiable_id ||
    payload.user_id ||
    payload.notifiable_id;
  const rideId = eventData.ride_id || payload.ride_id;
  const eventName = payload.event || eventData.event;

  // ── 1. Phát theo Ride Room ──────────────────────────────────────────────
  if (rideId) {
    const rideRoom = getRideRoom(rideId);

    if (channel === config.redisChannel) {
      // Tracking channel: GPS / trạng thái di chuyển
      rememberTrackingState(eventData);
      io.to(rideRoom).emit('ride:tracking.updated', eventData);
      logger.info('Socket emit: ride:tracking.updated', { room: rideRoom, event: eventName });
    } else if (channel === config.redisCommunicationChannel) {
      // Communication channel: vòng đời đơn hàng
      const eventToEmit = eventName || 'ride:communication.updated';
      io.to(rideRoom).emit(eventToEmit, eventData);
      logger.info(`Socket emit: ${eventToEmit}`, { room: rideRoom, ride_id: rideId });

      // Dọn tracking state khi đơn kết thúc
      if (eventName && ['ride.cancelled', 'ride.completed'].includes(eventName)) {
        clearTrackingState(rideId);
      }
    }
  }

  // ── 2. Phát theo User Room (cá nhân) ───────────────────────────────────
  if (userId) {
    const userRoom = getUserRoom(userId);
    const userRoomDot = getUserRoomDot(userId);

    if (
      channel === config.redisCommunicationChannel ||
      channel === config.redisFinanceChannel
    ) {
      const eventToEmit = eventName || 'user:communication.updated';
      io.to(userRoom).to(userRoomDot).emit(eventToEmit, eventData);
      logger.info(`Socket emit: ${eventToEmit}`, {
        room: userRoom,
        user_id: userId,
        event: eventToEmit,
      });
    }

    // ── 3. Phát theo Wallet Room (finance events) ─────────────────────────
    if (channel === config.redisFinanceChannel) {
      const walletRoom = getWalletRoom(userId);
      const eventToEmit = eventName || 'wallet:updated';
      io.to(walletRoom).emit(eventToEmit, eventData);
      logger.info(`Socket emit (wallet): ${eventToEmit}`, {
        room: walletRoom,
        user_id: userId,
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stale tracking sweep
// ─────────────────────────────────────────────────────────────────────────────

function startStaleTrackingSweep(io) {
  return setInterval(() => {
    const now = Date.now();
    getAllStates().forEach((state) => {
      if (state.staleNotified) return;
      if (now - state.lastSeenAt < config.locationStaleAfterMs) return;

      state.staleNotified = true;
      const stalePayload = buildStalePayload(state);
      io.to(getRideRoom(state.rideId)).emit('ride:tracking.updated', stalePayload);
      logger.warn('Tracking stale emitted', { rideId: state.rideId });
    });
  }, config.staleSweepIntervalMs);
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

async function start() {
  const httpServer = createHttpServer();

  const io = new Server(httpServer, {
    cors: {
      origin: config.corsOrigins.includes('*') ? '*' : config.corsOrigins,
      methods: ['GET', 'POST'],
    },
  });

  // Log lỗi handshake (xảy ra TRƯỚC khi 'connection' bắn)
  io.engine.on('connection_error', (err) => {
    logger.error('Engine connection_error', {
      code: err.code,
      message: err.message,
      context: err.context,
    });
  });

  // Đăng ký socket handlers
  attachSocketHandlers(io);

  // Đăng ký Redis subscriber
  try {
    await createSubscriber((channel, payload) => {
      dispatchRedisMessage(io, channel, payload);
    });
  } catch (error) {
    logger.error('Redis subscriber bootstrap failed', { error: error.message });
  }

  // Sweep stale tracking
  startStaleTrackingSweep(io);

  httpServer.listen(config.port, config.host, () => {
    logger.info('🚀 Realtime server started', {
      host: config.host,
      port: config.port,
      channels: {
        tracking: config.redisChannel,
        communication: config.redisCommunicationChannel,
        finance: config.redisFinanceChannel,
      },
    });
  });
}

module.exports = { start };
