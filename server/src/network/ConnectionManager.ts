import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import type { ServerMessage, ConnectedPlayer } from '../types/index.js';

export class ConnectionManager {
  private connections: Map<string, WebSocket> = new Map();
  private playerData: Map<string, ConnectedPlayer> = new Map();
  private socketToPlayer: Map<WebSocket, string> = new Map();

  addConnection(ws: WebSocket): string {
    const playerId = uuidv4();
    this.connections.set(playerId, ws);
    this.socketToPlayer.set(ws, playerId);
    this.playerData.set(playerId, {
      id: playerId,
      roomId: null,
      isReady: false,
    });

    logger.info('Player connected', { playerId });
    return playerId;
  }

  removeConnection(ws: WebSocket): string | null {
    const playerId = this.socketToPlayer.get(ws);
    if (!playerId) return null;

    this.connections.delete(playerId);
    this.socketToPlayer.delete(ws);
    this.playerData.delete(playerId);

    logger.info('Player disconnected', { playerId });
    return playerId;
  }

  getPlayerId(ws: WebSocket): string | null {
    return this.socketToPlayer.get(ws) || null;
  }

  getSocket(playerId: string): WebSocket | null {
    return this.connections.get(playerId) || null;
  }

  getPlayerData(playerId: string): ConnectedPlayer | null {
    return this.playerData.get(playerId) || null;
  }

  setPlayerRoom(playerId: string, roomId: string | null): void {
    const data = this.playerData.get(playerId);
    if (data) {
      data.roomId = roomId;
      data.isReady = false;
    }
  }

  setPlayerReady(playerId: string, isReady: boolean): void {
    const data = this.playerData.get(playerId);
    if (data) {
      data.isReady = isReady;
    }
  }

  send(playerId: string, message: ServerMessage): boolean {
    const ws = this.connections.get(playerId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      logger.warn('Failed to send message - socket not open', { playerId, messageType: message.type });
      return false;
    }

    try {
      ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      logger.error('Failed to send message', { playerId, error: String(error) });
      return false;
    }
  }

  broadcast(playerIds: string[], message: ServerMessage): void {
    for (const playerId of playerIds) {
      this.send(playerId, message);
    }
  }

  broadcastExcept(playerIds: string[], exceptPlayerId: string, message: ServerMessage): void {
    for (const playerId of playerIds) {
      if (playerId !== exceptPlayerId) {
        this.send(playerId, message);
      }
    }
  }

  isConnected(playerId: string): boolean {
    const ws = this.connections.get(playerId);
    return ws !== undefined && ws.readyState === WebSocket.OPEN;
  }

  getConnectionCount(): number {
    return this.connections.size;
  }
}

export const connectionManager = new ConnectionManager();
