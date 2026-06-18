const http = require('http');
const Redis = require('ioredis');
const { Server } = require('socket.io');
const config = require('./config');
const logger = require('./logger');

const trackingState = new Map();

function createRedisClient() {
  return new Redis({
    host: config.redisHost,
    port: config.redisPort,
    password: config.redisPassword,
    db: config.redisDb,
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });
}

function getRideRoom(rideId) {
  return `ride:${rideId}`;
}

function getUserRoom(userId) {
  return `user:${userId}`;
}

function getUserRoomDot(userId) {
  return `user.${userId}`;
}

function getWalletRoom(userId) {
  return `wallet:${userId}`;
}

function parsePayload(rawPayload) {
  try {
    return JSON.parse(rawPayload);
  } catch (error) {
    logger.error('Failed to parse Redis payload', { rawPayload, error: error.message });
    return null;
  }
}

function rememberTrackingState(payload) {
  if (!payload || !payload.ride_id) {
    return;
  }

  if (payload.event === 'tracking.driver.cancelled' || payload.event === 'tracking.customer.cancelled') {
    trackingState.delete(String(payload.ride_id));
    return;
  }

  const occurredAt = payload.location?.tracked_at || payload.occurred_at || new Date().toISOString();

  trackingState.set(String(payload.ride_id), {
    payload,
    rideId: String(payload.ride_id),
    lastSeenAt: new Date(occurredAt).getTime(),
    staleNotified: false,
  });
}

function buildStalePayload(state) {
  return {
    event: 'tracking.lost',
    ride_id: String(state.rideId),
    tracking_status: 4,
    tracking_status_label: 'Không thể cập nhật trạng thái tài xế',
    message: 'Không thể cập nhật trạng thái tài xế.',
    occurred_at: new Date().toISOString(),
  };
}

function attachSocketHandlers(io) {
  io.on('connection', (socket) => {
    logger.info('👤 CLIENT CONNECTED', { socketId: socket.id });

    const initialRideId = socket.handshake.auth?.rideId || socket.handshake.query?.rideId;
    if (initialRideId) {
      socket.join(getRideRoom(initialRideId));
      const state = trackingState.get(String(initialRideId));
      if (state) {
        socket.emit('ride:tracking.state', state.payload);
      }
    }

    const initialUserId = socket.handshake.auth?.userId || socket.handshake.query?.userId;
    if (initialUserId) {
      socket.join(getUserRoom(initialUserId));
      socket.join(getUserRoomDot(initialUserId));
    }

    const initialWalletUserId = socket.handshake.auth?.walletUserId || socket.handshake.query?.walletUserId;
    if (initialWalletUserId) {
      socket.join(getWalletRoom(initialWalletUserId));
    }

    // Generic join room event
    socket.on('join', (room) => {
      socket.join(room);
      logger.info('Client joined room', { socketId: socket.id, room });
    });

    // Generic leave room event
    socket.on('leave', (room) => {
      socket.leave(room);
      logger.info('Client left room', { socketId: socket.id, room });
    });

    socket.on('ride:join', (payload, callback) => {
      const rideId = payload?.rideId;
      if (!rideId) {
        if (typeof callback === 'function') callback({ ok: false, message: 'rideId is required' });
        return;
      }
      socket.join(getRideRoom(rideId));
      const state = trackingState.get(String(rideId));
      if (state) socket.emit('ride:tracking.state', state.payload);
      if (typeof callback === 'function') callback({ ok: true, room: getRideRoom(rideId) });
    });

    socket.on('ride:leave', (payload, callback) => {
      const rideId = payload?.rideId;
      if (rideId) socket.leave(getRideRoom(rideId));
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
      if (typeof callback === 'function') callback({ ok: true, room: getUserRoom(userId) });
    });

    socket.on('user:leave', (payload, callback) => {
      const userId = payload?.userId;
      if (userId) {
        socket.leave(getUserRoom(userId));
        socket.leave(getUserRoomDot(userId));
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
      if (typeof callback === 'function') callback({ ok: true, room: getWalletRoom(userId) });
    });

    socket.on('wallet:leave', (payload, callback) => {
      const userId = payload?.userId;
      if (userId) socket.leave(getWalletRoom(userId));
      if (typeof callback === 'function') callback({ ok: true });
    });
  });
}

async function subscribeRedis(io) {
  const subscriber = createRedisClient();
  subscriber.on('error', (error) => {
    logger.error('Redis subscriber error', { error: error.message });
  });

  await subscriber.connect();
  await subscriber.subscribe(
    config.redisChannel,
    config.redisCommunicationChannel,
    config.redisFinanceChannel
  );

  logger.info('Subscribed Redis channels', {
    trackingChannel: config.redisChannel,
    communicationChannel: config.redisCommunicationChannel,
    financeChannel: config.redisFinanceChannel,
  });

  subscriber.on('message', (channel, rawPayload) => {
    logger.info('Received Redis message', { channel, rawPayload });
    const payload = parsePayload(rawPayload);
    if (!payload) return;

    const eventData = payload.data || payload;
    const userId = eventData.user_id || eventData.notifiable_id || payload.user_id || payload.notifiable_id;
    const rideId = eventData.ride_id || payload.ride_id;
    const eventName = payload.event || eventData.event;

    // 1. Phát theo Ride ID
    if (rideId) {
      const rideRoom = getRideRoom(rideId);
      if (channel === config.redisChannel) {
        rememberTrackingState(eventData);
        io.to(rideRoom).emit('ride:tracking.updated', eventData);
      } else if (channel === config.redisCommunicationChannel) {
        
        // [SỬA Ở ĐÂY]: Phát eventName hoặc mặc định là 'ride:communication.updated'
        const eventToEmit = eventName || 'ride:communication.updated';
        io.to(rideRoom).emit(eventToEmit, eventData);
        
        if (eventName && ['ride.cancelled', 'ride.completed'].includes(eventName)) {
          trackingState.delete(String(rideId));
        }
      }
    }

    // 2. Phát theo User ID (General communication & Finance)
    if (userId) {
      const userRoom = getUserRoom(userId);
      const userRoomDot = getUserRoomDot(userId);
      if (channel === config.redisCommunicationChannel || channel === config.redisFinanceChannel) {
        
        // [SỬA Ở ĐÂY]: Phát eventName hoặc mặc định là 'user:communication.updated'
        const eventToEmit = eventName || 'user:communication.updated';
        io.to(userRoom).to(userRoomDot).emit(eventToEmit, eventData);
        
      }

      // Finance specific handling
      if (channel === config.redisFinanceChannel) {
        const walletRoom = getWalletRoom(userId);
        
        // [SỬA Ở ĐÂY]: Phát eventName hoặc mặc định là 'wallet:updated'
        const eventToEmit = eventName || 'wallet:updated';
        io.to(walletRoom).emit(eventToEmit, eventData);
        
        logger.info('Finance event broadcasted', { userId, event: eventToEmit });
      }
    }
  });

  return subscriber;
}

function startStaleTrackingSweep(io) {
  return setInterval(() => {
    const now = Date.now();
    trackingState.forEach((state) => {
      if (state.staleNotified) return;
      if (now - state.lastSeenAt < config.locationStaleAfterMs) return;
      state.staleNotified = true;
      const stalePayload = buildStalePayload(state);
      io.to(getRideRoom(state.rideId)).emit('ride:tracking.updated', stalePayload);
      logger.warn('Tracking stale emitted', { rideId: state.rideId });
    });
  }, config.staleSweepIntervalMs);
}

function createHttpServer() {
  return http.createServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok', service: 'nhm-realtime' }));
      return;
    }
    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ message: 'Not Found' }));
  });
}

async function start() {
  const server = createHttpServer();
  const io = new Server(server, {
    cors: {
      origin: config.corsOrigins.includes('*') ? '*' : config.corsOrigins,
      methods: ['GET', 'POST'],
    },
  });

  attachSocketHandlers(io);

  try {
    await subscribeRedis(io);
  } catch (error) {
    logger.error('Redis bootstrap failed', { error: error.message });
  }

  startStaleTrackingSweep(io);

  server.listen(config.port, config.host, () => {
    logger.info('Realtime server started', {
      host: config.host,
      port: config.port,
      redisChannel: config.redisChannel,
      redisCommunicationChannel: config.redisCommunicationChannel,
      redisFinanceChannel: config.redisFinanceChannel,
    });
  });
}

module.exports = { start };
