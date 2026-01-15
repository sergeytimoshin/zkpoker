import { WebSocketServer, WebSocket } from 'ws';
import { config } from './utils/config.js';
import { logger } from './utils/logger.js';
import { connectionManager } from './network/ConnectionManager.js';
import { handleMessage, handleDisconnect } from './network/MessageHandler.js';

export interface ServerOptions {
  port?: number;
  host?: string;
}

export function createServer(options: ServerOptions = {}): WebSocketServer {
  const port = options.port ?? config.port;
  const host = options.host ?? config.host;

  const wss = new WebSocketServer({ port, host });

  logger.info(`WebSocket server starting on ${host}:${port}`);

  wss.on('connection', (ws: WebSocket) => {
    const playerId = connectionManager.addConnection(ws);

    // Initialize heartbeat tracking
    (ws as any).isAlive = true;

    ws.on('pong', () => {
      (ws as any).isAlive = true;
    });

    ws.on('message', (data: Buffer) => {
      try {
        handleMessage(ws, data.toString());
      } catch (error) {
        logger.error('Error handling message', { playerId, error: String(error) });
      }
    });

    ws.on('close', () => {
      handleDisconnect(ws);
    });

    ws.on('error', (error) => {
      logger.error('WebSocket error', { playerId, error: String(error) });
    });

    // Send initial connection acknowledgment
    ws.send(JSON.stringify({
      type: 'connected',
      playerId,
    }));
  });

  wss.on('error', (error) => {
    logger.error('Server error', { error: String(error) });
  });

  // Heartbeat to detect dead connections
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if ((ws as any).isAlive === false) {
        return ws.terminate();
      }
      (ws as any).isAlive = false;
      ws.ping();
    });
  }, config.heartbeatIntervalMs);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
    logger.info('WebSocket server closed');
  });

  return wss;
}
