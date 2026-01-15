import { createServer } from './server.js';
import { config } from './utils/config.js';
import { logger } from './utils/logger.js';

// Set log level from environment
if (process.env.LOG_LEVEL) {
  logger.setLevel(process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error');
}

logger.info('ZK Poker Server starting...', {
  port: config.port,
  host: config.host,
  maxRooms: config.maxRooms,
});

const server = createServer();

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  logger.info('Shutting down...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

logger.info(`Server listening on ws://${config.host}:${config.port}`);
