const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');

function ensureLogDirectory() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function formatLog(level, message, meta = {}) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  });
}

function write(level, message, meta = {}) {
  ensureLogDirectory();

  const line = formatLog(level, message, meta);

  fs.appendFileSync(LOG_FILE, `${line}\n`, 'utf8');

  if (level === 'ERROR') {
    console.error(line);
    return;
  }

  if (level === 'WARN') {
    console.warn(line);
    return;
  }

  console.log(line);
}

module.exports = {
  info(message, meta) {
    write('INFO', message, meta);
  },

  warn(message, meta) {
    write('WARN', message, meta);
  },

  error(message, meta) {
    write('ERROR', message, meta);
  },
};