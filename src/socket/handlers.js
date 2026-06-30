const logger = require('../logger');
const { getRideRoom, getUserRoom, getUserRoomDot, getWalletRoom } = require('./roomManager');
const { getTrackingState } = require('./trackingState');

/**
 * Đăng ký toàn bộ Socket.io event handlers cho server.
 * Mỗi client kết nối sẽ tự động join các room tương ứng dựa trên
 * thông tin handshake (rideId, userId, walletUserId).
 *
 * @param {import('socket.io').Server} io
 */
function attachSocketHandlers(io) {
  io.on('connection', (socket) => {
    const initialRideId =
      socket.handshake.auth?.rideId || socket.handshake.query?.rideId;
    const initialUserId =
      socket.handshake.auth?.userId || socket.handshake.query?.userId;
    const initialWalletUserId =
      socket.handshake.auth?.walletUserId || socket.handshake.query?.walletUserId;

    logger.info('👤 CLIENT CONNECTED', {
      socketId: socket.id,
      transport: socket.conn?.transport?.name,
      ip: socket.handshake.address,
      rideId: initialRideId || null,
      userId: initialUserId || null,
      walletUserId: initialWalletUserId || null,
    });

    // Auto-join rooms từ handshake
    if (initialRideId) {
      socket.join(getRideRoom(initialRideId));
      const state = getTrackingState(initialRideId);
      if (state) {
        socket.emit('ride:tracking.state', state.payload);
        logger.info('Replayed tracking state for newly connected client', {
          socketId: socket.id,
          rideId: initialRideId,
        });
      }
    }

    if (initialUserId) {
      socket.join(getUserRoom(initialUserId));
      socket.join(getUserRoomDot(initialUserId));
    }

    if (initialWalletUserId) {
      socket.join(getWalletRoom(initialWalletUserId));
    }

    // --- Lifecycle events ---

    socket.on('disconnect', (reason) => {
      logger.warn('🔌 CLIENT DISCONNECTED', {
        socketId: socket.id,
        reason,
        rideId: initialRideId || null,
        userId: initialUserId || null,
      });
    });

    socket.on('disconnecting', (reason) => {
      logger.warn('🔌 CLIENT DISCONNECTING', {
        socketId: socket.id,
        reason,
        rooms: Array.from(socket.rooms || []),
      });
    });

    socket.on('error', (error) => {
      logger.error('Socket error', {
        socketId: socket.id,
        error: error?.message || String(error),
      });
    });

    socket.on('connect_error', (error) => {
      logger.error('Socket connect_error', {
        socketId: socket.id,
        error: error?.message || String(error),
      });
    });

    // --- Room management events ---

    socket.on('join', (room) => {
      socket.join(room);
      logger.info('Client joined room (generic)', { socketId: socket.id, room });
    });

    socket.on('leave', (room) => {
      socket.leave(room);
      logger.info('Client left room (generic)', { socketId: socket.id, room });
    });

    socket.on('ride:join', (payload, callback) => {
      const rideId = payload?.rideId;
      if (!rideId) {
        if (typeof callback === 'function') callback({ ok: false, message: 'rideId is required' });
        return;
      }
      socket.join(getRideRoom(rideId));
      const state = getTrackingState(rideId);
      if (state) socket.emit('ride:tracking.state', state.payload);
      logger.info('Client joined ride room', { socketId: socket.id, rideId });
      if (typeof callback === 'function') callback({ ok: true, room: getRideRoom(rideId) });
    });

    socket.on('ride:leave', (payload, callback) => {
      const rideId = payload?.rideId;
      if (rideId) {
        socket.leave(getRideRoom(rideId));
        logger.info('Client left ride room', { socketId: socket.id, rideId });
      }
      if (typeof callback === 'function') callback({ ok: true });
    });

    socket.on('user:join', (payload, callback) => {
      const userId = payload?.userId;
      if (!userId) {
        if (typeof callback === 'function') callback({ ok: false, message: 'userId is required' });
        return;
      }
      socket.join(getUserRoom(userId));
      socket.join(getUserRoomDot(userId));
      logger.info('Client joined user room', { socketId: socket.id, userId });
      if (typeof callback === 'function') callback({ ok: true, room: getUserRoom(userId) });
    });

    socket.on('user:leave', (payload, callback) => {
      const userId = payload?.userId;
      if (userId) {
        socket.leave(getUserRoom(userId));
        socket.leave(getUserRoomDot(userId));
        logger.info('Client left user room', { socketId: socket.id, userId });
      }
      if (typeof callback === 'function') callback({ ok: true });
    });

    socket.on('wallet:join', (payload, callback) => {
      const userId = payload?.userId;
      if (!userId) {
        if (typeof callback === 'function') callback({ ok: false, message: 'userId is required' });
        return;
      }
      socket.join(getWalletRoom(userId));
      logger.info('Client joined wallet room', { socketId: socket.id, userId });
      if (typeof callback === 'function') callback({ ok: true, room: getWalletRoom(userId) });
    });

    socket.on('wallet:leave', (payload, callback) => {
      const userId = payload?.userId;
      if (userId) {
        socket.leave(getWalletRoom(userId));
        logger.info('Client left wallet room', { socketId: socket.id, userId });
      }
      if (typeof callback === 'function') callback({ ok: true });
    });
  });
}

module.exports = { attachSocketHandlers };
