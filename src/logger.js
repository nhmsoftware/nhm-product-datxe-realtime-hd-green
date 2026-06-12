function log(level, message, context = {}) {
  const payload = {
    level,
    message,
    context,
    timestamp: new Date().toISOString(),
  };

  console.log(JSON.stringify(payload));
}

module.exports = {
  info(message, context) {
    log('info', message, context);
  },
  warn(message, context) {
    log('warn', message, context);
  },
  error(message, context) {
    log('error', message, context);
  },
};
