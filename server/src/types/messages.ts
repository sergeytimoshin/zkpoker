import { z } from 'zod';
import type { GameStateN, GameConfig, RoomStatus, ActionType } from './game.js';
import type { PlayerState } from './player.js';

// Client -> Server Messages
export const JoinRoomMessage = z.object({
  type: z.literal('join_room'),
  roomId: z.string().optional(), // If not provided, creates new room
  playerName: z.string().min(1).max(32),
  publicKeyX: z.string(), // Hex encoded
  publicKeyY: z.string(), // Hex encoded
});

export const LeaveRoomMessage = z.object({
  type: z.literal('leave_room'),
});

export const ReadyMessage = z.object({
  type: z.literal('ready'),
  isReady: z.boolean(),
});

export const SubmitActionMessage = z.object({
  type: z.literal('submit_action'),
  actionType: z.number().min(0).max(5),
  amount: z.number().min(0),
  proof: z.string().optional(),         // Base64 encoded proof
  publicWitness: z.string().optional(), // Base64 encoded public witness
  stateCommitment: z.string().optional(), // Hex encoded commitment (for reference)
});

export const SubmitShuffleMessage = z.object({
  type: z.literal('submit_shuffle'),
  shuffledDeck: z.array(z.object({
    epkX: z.string(),
    epkY: z.string(),
    msgX: z.string(),
    msgY: z.string(),
    pkX: z.string(),
    pkY: z.string(),
  })),
  deckCommitment: z.string(),           // Hex encoded commitment after shuffle
  proof: z.string().optional(),         // Base64 encoded proof
  publicWitness: z.string().optional(), // Base64 encoded public witness
});

export const SubmitUnmaskMessage = z.object({
  type: z.literal('submit_unmask'),
  cardIndex: z.number(),
  unmaskedCard: z.object({
    epkX: z.string(),
    epkY: z.string(),
    msgX: z.string(),
    msgY: z.string(),
    pkX: z.string(),
    pkY: z.string(),
  }),
  proof: z.string().optional(),         // Base64 encoded proof
  publicWitness: z.string().optional(), // Base64 encoded public witness
});

export const SubmitHandRevealMessage = z.object({
  type: z.literal('submit_hand_reveal'),
  handRank: z.number(),
  handDescription: z.string(),
  cardIndices: z.array(z.number()),
  proof: z.string().optional(),         // Base64 encoded proof
  publicWitness: z.string().optional(), // Base64 encoded public witness
});

export const ClientMessage = z.discriminatedUnion('type', [
  JoinRoomMessage,
  LeaveRoomMessage,
  ReadyMessage,
  SubmitActionMessage,
  SubmitShuffleMessage,
  SubmitUnmaskMessage,
  SubmitHandRevealMessage,
]);

export type ClientMessageType = z.infer<typeof ClientMessage>;

// Server -> Client Messages
export interface ErrorResponse {
  type: 'error';
  code: string;
  message: string;
}

export interface RoomJoinedResponse {
  type: 'room_joined';
  roomId: string;
  playerId: string;
  seatIndex: number;
  players: Array<{
    id: string;
    name: string;
    seatIndex: number;
    isReady: boolean;
    isConnected: boolean;
  }>;
  config: GameConfig;
}

export interface PlayerJoinedResponse {
  type: 'player_joined';
  playerId: string;
  playerName: string;
  seatIndex: number;
}

export interface PlayerLeftResponse {
  type: 'player_left';
  playerId: string;
  seatIndex: number;
}

export interface PlayerReadyResponse {
  type: 'player_ready';
  playerId: string;
  isReady: boolean;
}

export interface GameStartedResponse {
  type: 'game_started';
  gameState: SerializedGameState;
}

export interface ShuffleTurnResponse {
  type: 'shuffle_turn';
  playerId: string;
  seatIndex: number;
  currentDeck: SerializedCard[];
}

export interface ShuffleCompleteResponse {
  type: 'shuffle_complete';
  playerId: string;
  deckCommitment: string;
}

export interface CardsDealtResponse {
  type: 'cards_dealt';
  yourCards: number[]; // Indices of your hole cards in deck
}

export interface UnmaskRequestResponse {
  type: 'unmask_request';
  cardIndex: number;
  forPlayerId: string;
  card?: SerializedCard; // Card data for unmask
}

export interface PlayerTurnResponse {
  type: 'player_turn';
  playerId: string;
  seatIndex: number;
  validActions: ActionType[];
  minBet: number;
  minRaise: number;
  amountToCall: number;
  timeoutMs: number;
}

export interface ActionResultResponse {
  type: 'action_result';
  playerId: string;
  actionType: ActionType;
  amount: number;
  newPot: number;
  playerStack: number;
}

export interface StreetAdvancedResponse {
  type: 'street_advanced';
  street: number;
  communityCardIndices: number[];
}

export interface ShowdownResponse {
  type: 'showdown';
  players: Array<{
    id: string;
    handRank: number;
    handDescription: string;
    cards: number[];
  }>;
  winners: string[];
  potDistribution: Array<{
    playerId: string;
    amount: number;
  }>;
}

export interface FoldWinnerResponse {
  type: 'fold_winner';
  winnerId: string;
  amount: number;
}

export interface GameEndedResponse {
  type: 'game_ended';
  reason: 'showdown' | 'fold' | 'timeout';
  finalStacks: Array<{
    playerId: string;
    stack: number;
  }>;
}

export interface RoomClosedResponse {
  type: 'room_closed';
  reason: string;
}

export type ServerMessage =
  | ErrorResponse
  | RoomJoinedResponse
  | PlayerJoinedResponse
  | PlayerLeftResponse
  | PlayerReadyResponse
  | GameStartedResponse
  | ShuffleTurnResponse
  | ShuffleCompleteResponse
  | CardsDealtResponse
  | UnmaskRequestResponse
  | PlayerTurnResponse
  | ActionResultResponse
  | StreetAdvancedResponse
  | ShowdownResponse
  | FoldWinnerResponse
  | GameEndedResponse
  | RoomClosedResponse;

// Serialization helpers
export interface SerializedCard {
  epkX: string;
  epkY: string;
  msgX: string;
  msgY: string;
  pkX: string;
  pkY: string;
}

export interface SerializedGameState {
  players: Array<{
    id: string;
    seatIndex: number;
    stack: number;
    streetBet: number;
    folded: boolean;
    allIn: boolean;
  }>;
  pot: number;
  street: number;
  buttonPos: number;
  actionPos: number;
  status: string;
}
