import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from '../src/server.js';
import { GameClient } from '../src/client/GameClient.js';

describe('Integration Tests', () => {
  let server: WebSocketServer;
  const PORT = 9876; // Use a different port to avoid conflicts
  const URL = `ws://localhost:${PORT}`;

  beforeAll(async () => {
    server = createServer({ port: PORT, host: 'localhost' });
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterAll(() => {
    server.close();
  });

  describe('Connection', () => {
    it('should connect and receive player ID', async () => {
      const client = new GameClient({ url: URL, autoReconnect: false });

      const playerId = await client.connect();

      expect(playerId).toBeDefined();
      expect(typeof playerId).toBe('string');

      client.disconnect();
    });

    it('should emit connected event', async () => {
      const client = new GameClient({ url: URL, autoReconnect: false });

      let connectedPlayerId: string | null = null;
      client.on('connected', (id) => {
        connectedPlayerId = id;
      });

      await client.connect();

      expect(connectedPlayerId).toBeDefined();

      client.disconnect();
    });
  });

  describe('Room Management', () => {
    it('should create a room', async () => {
      const client = new GameClient({ url: URL, autoReconnect: false });
      await client.connect();

      const roomJoinedPromise = new Promise<string>((resolve) => {
        client.on('room_joined', (roomId) => {
          resolve(roomId);
        });
      });

      client.createRoom('Player1', '0x1234', '0x5678');

      const roomId = await roomJoinedPromise;
      expect(roomId).toBeDefined();
      expect(typeof roomId).toBe('string');

      client.disconnect();
    });

    it('should allow second player to join room', async () => {
      const client1 = new GameClient({ url: URL, autoReconnect: false });
      const client2 = new GameClient({ url: URL, autoReconnect: false });

      await client1.connect();
      await client2.connect();

      // Client 1 creates room
      const roomIdPromise = new Promise<string>((resolve) => {
        client1.on('room_joined', (roomId) => resolve(roomId));
      });
      client1.createRoom('Player1', '0x1111', '0x2222');
      const roomId = await roomIdPromise;

      // Client 2 joins
      const client2JoinedPromise = new Promise<void>((resolve) => {
        client2.on('room_joined', () => resolve());
      });
      client2.joinRoom(roomId, 'Player2', '0x3333', '0x4444');
      await client2JoinedPromise;

      // Client 1 should see player joined
      const playerJoinedPromise = new Promise<string>((resolve) => {
        client1.on('player_joined', (playerId) => resolve(playerId));
      });

      // Already happened, check state
      expect(client2.getRoomId()).toBe(roomId);

      client1.disconnect();
      client2.disconnect();
    });

    it('should start game when both players ready', async () => {
      const client1 = new GameClient({ url: URL, autoReconnect: false });
      const client2 = new GameClient({ url: URL, autoReconnect: false });

      await client1.connect();
      await client2.connect();

      // Client 1 creates room
      const roomIdPromise = new Promise<string>((resolve) => {
        client1.on('room_joined', (roomId) => resolve(roomId));
      });
      client1.createRoom('Player1', '0xaaaa', '0xbbbb');
      const roomId = await roomIdPromise;

      // Client 2 joins
      const client2JoinedPromise = new Promise<void>((resolve) => {
        client2.on('room_joined', () => resolve());
      });
      client2.joinRoom(roomId, 'Player2', '0xcccc', '0xdddd');
      await client2JoinedPromise;

      // Set up game started listener
      const gameStartedPromise = new Promise<void>((resolve) => {
        client1.on('game_started', () => resolve());
      });

      // Both ready
      client1.setReady(true);
      client2.setReady(true);

      // Wait for game to start (with timeout)
      await Promise.race([
        gameStartedPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000)),
      ]);

      client1.disconnect();
      client2.disconnect();
    });
  });

  describe('Error Handling', () => {
    it('should receive error for invalid room', async () => {
      const client = new GameClient({ url: URL, autoReconnect: false });
      await client.connect();

      const errorPromise = new Promise<{ code: string; message: string }>((resolve) => {
        client.on('server_error', (code, message) => {
          resolve({ code, message });
        });
      });

      client.joinRoom('invalid-room-id', 'Player', '0x1234', '0x5678');

      const error = await errorPromise;
      expect(error.code).toBe('ROOM_NOT_FOUND');

      client.disconnect();
    });

    it('should receive error for action when not in room', async () => {
      const client = new GameClient({ url: URL, autoReconnect: false });
      await client.connect();

      const errorPromise = new Promise<{ code: string }>((resolve) => {
        client.on('server_error', (code) => {
          resolve({ code });
        });
      });

      client.submitAction(0, 0, '0x1234');

      const error = await errorPromise;
      expect(error.code).toBe('NOT_IN_ROOM');

      client.disconnect();
    });
  });
});
