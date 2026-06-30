/**
 * In-memory store lưu trạng thái tracking cuối cùng của từng ride_id.
 * Dùng để:
 * 1. Replay state cho client vừa kết nối vào ride room (không mất context).
 * 2. Phát hiện tracking stale (GPS không cập nhật quá lâu) và báo client.
 */
const trackingState = new Map();

/**
 * Lưu hoặc cập nhật tracking state cho một ride.
 * Xóa state khi sự kiện cancel xảy ra.
 *
 * @param {object} payload
 */
function rememberTrackingState(payload) {
  if (!payload || !payload.ride_id) return;

  const rideId = String(payload.ride_id);

  if (
    payload.event === 'tracking.driver.cancelled' ||
    payload.event === 'tracking.customer.cancelled'
  ) {
    trackingState.delete(rideId);
    return;
  }

  const occurredAt =
    payload.location?.tracked_at || payload.occurred_at || new Date().toISOString();

  trackingState.set(rideId, {
    payload,
    rideId,
    lastSeenAt: new Date(occurredAt).getTime(),
    staleNotified: false,
  });
}

/**
 * Lấy state hiện tại của ride (để replay cho client mới join).
 *
 * @param {string} rideId
 * @returns {object|undefined}
 */
function getTrackingState(rideId) {
  return trackingState.get(String(rideId));
}

/**
 * Xóa tracking state khi ride kết thúc (completed / cancelled).
 *
 * @param {string} rideId
 */
function clearTrackingState(rideId) {
  trackingState.delete(String(rideId));
}

/**
 * Lấy toàn bộ map để sweep job có thể iterate.
 *
 * @returns {Map}
 */
function getAllStates() {
  return trackingState;
}

/**
 * Build payload sự kiện "tracking lost" khi GPS không cập nhật trong thời gian dài.
 *
 * @param {object} state - entry trong trackingState
 * @returns {object}
 */
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

module.exports = {
  rememberTrackingState,
  getTrackingState,
  clearTrackingState,
  getAllStates,
  buildStalePayload,
};
