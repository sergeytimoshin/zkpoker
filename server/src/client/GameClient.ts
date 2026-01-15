import WebSocket from 'ws';
import { EventEmitter } from 'events';
import type {
  ServerMessage,
  ClientMessageType,
  GameConfig,
  SerializedCard,
  SerializedGameState,
  ActionType,
} from '../types/index.js';

export interface GameClientOptions {
  url: string;
  autoReconnect?: boolean;
  reconnectIntervalMs?: number;
}

export interface PlayerInfo {
  id: string;
  name: string;
  seatIndex: number;
  isReady: boolean;
  isConnected: boolean;
}

export type GameClientEventMap = {
  connected: [playerId: string];
  disconnected: [];
  error: [error: Error];
  room_joined: [roomId: string, seatIndex: number, players: PlayerInfo[], config: GameConfig];
  player_joined: [playerId: string, playerName: string, seatIndex: number];
  player_left: [playerId: string, seatIndex: number];
  player_ready: [playerId: string, isReady: boolean];
  game_started: [gameState: SerializedGameState];
  shuffle_turn: [playerId: string, seatIndex: number, currentDeck: SerializedCard[]];
  shuffle_complete: [playerId: string, deckCommitment: string];
  cards_dealt: [cardIndices: number[]];
  unmask_request: [cardIndex: number, forPlayerId: string];
  card_partially_unmasked: [cardIndex: number, byPlayerId: string, remainingUnmasks: number];
  card_fully_unmasked: [cardIndex: number, card: SerializedCard];
  player_turn: [playerId: string, seatIndex: number, validActions: ActionType[], minBet: number, minRaise: number, timeoutMs: number];
  action_result: [playerId: string, actionType: ActionType, amount: number, newPot: number, playerStack: number];
  street_advanced: [street: number, communityCardIndices: number[]];
  reveal_hand_request: [pot: number, opponents: { id: string; seatIndex: number }[]];
  hand_revealed: [playerId: string, handRank: number, handDescription: string, cardIndices: number[]];
  showdown: [players: any[], winners: string[], potDistribution: { playerId: string; amount: number }[]];
  game_ended: [reason: string, finalStacks: { playerId: string; stack: number }[]];
  server_error: [code: string, message: string];
};

export class GameClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private options: Required<GameClientOptions>;
  private playerId: string | null = null;
  private roomId: string | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(options: GameClientOptions) {
    super();
    this.options = {
      autoReconnect: true,
      reconnectIntervalMs: 5000,
      ...options,
    };
  }

  connect(): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.options.url);

        this.ws.on('open', () => {
          this.clearReconnectTimer();
        });

        this.ws.on('message', (data: Buffer) => {
          this.handleMessage(data.toString(), resolve);
        });

        this.ws.on('close', () => {
          this.emit('disconnected');
          if (this.options.autoReconnect) {
            this.scheduleReconnect();
          }
        });

        this.ws.on('error', (error) => {
          this.emit('error', error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect(): void {
    this.clearReconnectTimer();
    this.options.autoReconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private handleMessage(data: string, onConnect?: (playerId: string) => void): void {
    try {
      const message = JSON.parse(data) as ServerMessage | { type: 'connected'; playerId: string };

      // Handle initial connection
      if (message.type === 'connected') {
        this.playerId = (message as any).playerId;
        this.emit('connected', this.playerId);
        if (onConnect) {
          onConnect(this.playerId!);
        }
        return;
      }

      // Handle other messages
      switch (message.type) {
        case 'error':
          this.emit('server_error', message.code, message.message);
          break;

        case 'room_joined':
          this.roomId = message.roomId;
          this.emit('room_joined', message.roomId, message.seatIndex, message.players, message.config);
          break;

        case 'player_joined':
          this.emit('player_joined', message.playerId, message.playerName, message.seatIndex);
          break;

        case 'player_left':
          this.emit('player_left', message.playerId, message.seatIndex);
          break;

        case 'player_ready':
          this.emit('player_ready', message.playerId, message.isReady);
          break;

        case 'game_started':
          this.emit('game_started', message.gameState);
          break;

        case 'shuffle_turn':
          this.emit('shuffle_turn', message.playerId, message.seatIndex, message.currentDeck);
          break;

        case 'shuffle_complete':
          this.emit('shuffle_complete', message.playerId, message.deckCommitment);
          break;

        case 'cards_dealt':
          this.emit('cards_dealt', message.yourCards);
          break;

        case 'unmask_request':
          this.emit('unmask_request', message.cardIndex, message.forPlayerId);
          break;

        case 'player_turn':
          this.emit('player_turn', message.playerId, message.seatIndex, message.validActions, message.minBet, message.minRaise, message.timeoutMs);
          break;

        case 'action_result':
          this.emit('action_result', message.playerId, message.actionType, message.amount, message.newPot, message.playerStack);
          break;

        case 'street_advanced':
          this.emit('street_advanced', message.street, message.communityCardIndices);
          break;

        case 'showdown':
          this.emit('showdown', message.players, message.winners, message.potDistribution);
          break;

        case 'game_ended':
          this.emit('game_ended', message.reason, message.finalStacks);
          break;

        // Handle custom messages
        default:
          this.handleCustomMessage(message as any);
      }
    } catch (error) {
      this.emit('error', new Error(`Failed to parse message: ${error}`));
    }
  }

  private handleCustomMessage(message: any): void {
    switch (message.type) {
      case 'card_partially_unmasked':
        this.emit('card_partially_unmasked', message.cardIndex, message.byPlayerId, message.remainingUnmasks);
        break;
      case 'card_fully_unmasked':
        this.emit('card_fully_unmasked', message.cardIndex, message.card);
        break;
      case 'reveal_hand_request':
        this.emit('reveal_hand_request', message.pot, message.opponents);
        break;
      case 'hand_revealed':
        this.emit('hand_revealed', message.playerId, message.handRank, message.handDescription, message.cardIndices);
        break;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {});
    }, this.options.reconnectIntervalMs);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private send(message: ClientMessageType): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected');
    }
    this.ws.send(JSON.stringify(message));
  }

  // Public API methods

  getPlayerId(): string | null {
    return this.playerId;
  }

  getRoomId(): string | null {
    return this.roomId;
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  createRoom(playerName: string, publicKeyX: string, publicKeyY: string): void {
    this.send({
      type: 'join_room',
      playerName,
      publicKeyX,
      publicKeyY,
    });
  }

  joinRoom(roomId: string, playerName: string, publicKeyX: string, publicKeyY: string): void {
    this.send({
      type: 'join_room',
      roomId,
      playerName,
      publicKeyX,
      publicKeyY,
    });
  }

  leaveRoom(): void {
    this.send({ type: 'leave_room' });
    this.roomId = null;
  }

  setReady(isReady: boolean): void {
    this.send({ type: 'ready', isReady });
  }

  submitAction(actionType: number, amount: number, stateCommitment: string, proof?: string): void {
    this.send({
      type: 'submit_action',
      actionType,
      amount,
      stateCommitment,
      proof,
    });
  }

  submitShuffle(
    shuffledDeck: SerializedCard[],
    deckCommitment: string,
    proof?: string
  ): void {
    this.send({
      type: 'submit_shuffle',
      shuffledDeck,
      deckCommitment,
      proof,
    });
  }

  submitUnmask(cardIndex: number, unmaskedCard: SerializedCard, proof?: string): void {
    this.send({
      type: 'submit_unmask',
      cardIndex,
      unmaskedCard,
      proof,
    });
  }

  submitHandReveal(
    handRank: number,
    handDescription: string,
    cardIndices: number[],
    proof?: string
  ): void {
    this.send({
      type: 'submit_hand_reveal',
      handRank,
      handDescription,
      cardIndices,
      proof,
    });
  }
}
