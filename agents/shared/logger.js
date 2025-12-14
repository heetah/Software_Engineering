/**
 * Shared logging utility for Vision & Coder Agent Backend
 * Provides structured logging with request IDs for better traceability
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Log levels: ERROR, WARN, INFO, DEBUG
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

const currentLogLevel = LOG_LEVELS.INFO;

/**
 * Format log entry with timestamp and request ID
 */
function formatLogEntry(level, message, requestId = null, meta = {}) {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    level,
    message,
    ...(requestId && { requestId }),
    ...meta
  };
  return JSON.stringify(entry);
}

/**
 * Write log to console and optionally to file
 */
function writeLog(level, message, requestId = null, meta = {}) {
  const levelValue = LOG_LEVELS[level];
  if (levelValue > currentLogLevel) return;

  const logEntry = formatLogEntry(level, message, requestId, meta);

  // Console output with colors
  const colorMap = {
    ERROR: '\x1b[31m', // Red
    WARN: '\x1b[33m',  // Yellow
    INFO: '\x1b[36m',  // Cyan
    DEBUG: '\x1b[90m'  // Gray
  };
  const resetColor = '\x1b[0m';
  console.log(`${colorMap[level] || ''}${logEntry}${resetColor}`);

  // Optional: Write to log file (disabled by default to avoid clutter)
  // Uncomment if you want persistent logs
  // const logFile = path.join(__dirname, '..', 'app.log');
  // try {
  //   fs.appendFileSync(logFile, logEntry + '\n');
  // } catch (e) {
  //   console.error('Failed to write to log file:', e);
  // }
}

const logger = {
  error: (message, requestId = null, meta = {}) => writeLog('ERROR', message, requestId, meta),
  warn: (message, requestId = null, meta = {}) => writeLog('WARN', message, requestId, meta),
  info: (message, requestId = null, meta = {}) => writeLog('INFO', message, requestId, meta),
  debug: (message, requestId = null, meta = {}) => writeLog('DEBUG', message, requestId, meta),

  /**
   * Generate a unique request ID
   */
  generateRequestId: () => {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
};

export default logger;
