import { logger } from '../utils/logger.js';
import { config } from '../utils/config.js';
import { connectionManager } from '../network/ConnectionManager.js';
import { GameRoom } from './GameRoom.js';
import type { Point, GameAction, GameConfig, DEFAULT_GAME_CONFIG } from '../types/index.js';

class RoomManager {
  private rooms: Map<string, GameRoom> = new Map();

  createRoom(
    playerId: string,
    playerName: string,
    publicKey: Point,
    customConfig?: Partial<GameConfig>
  ): GameRoom | null {
    if (this.rooms.size >= config.maxRooms) {
      connectionManager.send(playerId, {
        type: 'error',
        code: 'MAX_ROOMS',
        message: 'Maximum number of rooms reached',
      });
      return null;
    }

    const room = new GameRoom(customConfig as GameConfig);
    this.rooms.set(room.id, room);

    logger.info('Room created', { roomId: room.id, createdBy: playerId });

    const result = room.addPlayer(playerId, playerName, publicKey);
    if (!result.success) {
      this.rooms.delete(room.id);
      connectionManager.send(playerId, {
        type: 'error',
        code: 'JOIN_FAILED',
        message: result.error || 'Failed to join room',
      });
      return null;
    }

    return room;
  }

  joinRoom(
    roomId: string,
    playerId: string,
    playerName: string,
    publicKey: Point
  ): boolean {
    const room = this.rooms.get(roomId);
    if (!room) {
      connectionManager.send(playerId, {
        type: 'error',
        code: 'ROOM_NOT_FOUND',
        message: 'Room not found',
      });
      return false;
    }

    const result = room.addPlayer(playerId, playerName, publicKey);
    if (!result.success) {
      connectionManager.send(playerId, {
        type: 'error',
        code: 'JOIN_FAILED',
        message: result.error || 'Failed to join room',
      });
      return false;
    }

    return true;
  }

  leaveRoom(roomId: string, playerId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.removePlayer(playerId);

    // Clean up empty rooms
    if (room.getPlayerCount() === 0) {
      this.rooms.delete(roomId);
      logger.info('Room deleted (empty)', { roomId });
    }
  }

  setPlayerReady(roomId: string, playerId: string, isReady: boolean): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.setPlayerReady(playerId, isReady);
  }

  submitAction(
    roomId: string,
    playerId: string,
    action: GameAction,
    proof?: string,
    publicWitness?: string
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      connectionManager.send(playerId, {
        type: 'error',
        code: 'ROOM_NOT_FOUND',
        message: 'Room not found',
      });
      return;
    }

    room.submitAction(playerId, action, proof, publicWitness);
  }

  submitShuffle(
    roomId: string,
    playerId: string,
    shuffledDeck: any[],
    deckCommitment: string,
    proof?: string,
    publicWitness?: string
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      connectionManager.send(playerId, {
        type: 'error',
        code: 'ROOM_NOT_FOUND',
        message: 'Room not found',
      });
      return;
    }

    room.submitShuffle(playerId, shuffledDeck, deckCommitment, proof, publicWitness);
  }

  submitUnmask(
    roomId: string,
    playerId: string,
    cardIndex: number,
    unmaskedCard: any,
    proof?: string,
    publicWitness?: string
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      connectionManager.send(playerId, {
        type: 'error',
        code: 'ROOM_NOT_FOUND',
        message: 'Room not found',
      });
      return;
    }

    room.submitUnmask(playerId, cardIndex, unmaskedCard, proof, publicWitness);
  }

  submitHandReveal(
    roomId: string,
    playerId: string,
    handRank: number,
    handDescription: string,
    cardIndices: number[],
    proof?: string,
    publicWitness?: string
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      connectionManager.send(playerId, {
        type: 'error',
        code: 'ROOM_NOT_FOUND',
        message: 'Room not found',
      });
      return;
    }

    room.submitHandReveal(playerId, handRank, handDescription, cardIndices, proof, publicWitness);
  }

  handleDisconnect(roomId: string, playerId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.handleDisconnect(playerId);

    // Clean up empty rooms
    if (room.getPlayerCount() === 0) {
      this.rooms.delete(roomId);
      logger.info('Room deleted (empty after disconnect)', { roomId });
    }
  }

  getRoom(roomId: string): GameRoom | undefined {
    return this.rooms.get(roomId);
  }

  getRoomCount(): number {
    return this.rooms.size;
  }

  getRoomList(): Array<{ id: string; playerCount: number; status: string }> {
    return Array.from(this.rooms.values()).map(room => ({
      id: room.id,
      playerCount: room.getPlayerCount(),
      status: room.getStatus(),
    }));
  }
}

export const roomManager = new RoomManager();
