/**
 * Quản lý tên phòng (room) Socket.io theo quy ước đặt tên thống nhất.
 */

function getRideRoom(rideId) {
  return `ride:${rideId}`;
}

function getUserRoom(userId) {
  return `user:${userId}`;
}

/**
 * Alias dạng dấu chấm — một số client cũ dùng format này.
 */
function getUserRoomDot(userId) {
  return `user.${userId}`;
}

function getWalletRoom(userId) {
  return `wallet:${userId}`;
}

module.exports = { getRideRoom, getUserRoom, getUserRoomDot, getWalletRoom };
