const http = require('http');

/**
 * Tạo HTTP server nhẹ chỉ phục vụ health check endpoint.
 * Socket.io sẽ attach vào server này.
 *
 * @returns {import('http').Server}
 */
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

module.exports = { createHttpServer };
