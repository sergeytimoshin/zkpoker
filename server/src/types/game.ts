import type { PlayerState, Point } from './player.js';

export enum Street {
  PREFLOP = 0,
  FLOP = 1,
  TURN = 2,
  RIVER = 3,
  SHOWDOWN = 4,
}

export enum ActionType {
  FOLD = 0,
  CHECK = 1,
  CALL = 2,
  BET = 3,
  RAISE = 4,
  ALL_IN = 5,
}

export enum GameStatus {
  WAITING = 'waiting',
  SHUFFLE = 'shuffle',
  DEALING = 'dealing',
  BETTING = 'betting',
  SHOWDOWN = 'showdown',
  FINISHED = 'finished',
}

export enum RoomStatus {
  WAITING = 'waiting',
  IN_GAME = 'in_game',
  CLOSED = 'closed',
}

export interface GameAction {
  playerId: string;
  type: ActionType;
  amount: number;
  proof?: string; // Base64 encoded proof
}

export interface Card {
  epk: Point;
  msg: Point;
  pk: Point;
}

export interface GameStateN {
  players: PlayerState[];
  pot: number;
  sidePots: SidePot[];
  street: Street;
  buttonPos: number; // Dealer button seat index
  actionPos: number; // Current player seat index to act
  lastAggressor: number | null; // Seat index of last bet/raise
  lastRaiseAmount: number; // Size of last raise (for min-raise calc)
  minRaise: number; // Minimum raise amount
  status: GameStatus;
  communityCards: Card[];
  deck: Card[];
  currentShuffler: number; // Seat index of player currently shuffling
}

export interface SidePot {
  amount: number;
  eligiblePlayers: string[]; // Player IDs eligible for this pot
}

export interface GameConfig {
  minPlayers: number;
  maxPlayers: number;
  smallBlind: number;
  bigBlind: number;
  startingStack: number;
  turnTimeoutMs: number;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  minPlayers: 2,
  maxPlayers: 10,
  smallBlind: 1,
  bigBlind: 2,
  startingStack: 100,
  turnTimeoutMs: 60000, // 60 seconds
};

export function createInitialGameState(
  players: PlayerState[],
  config: GameConfig,
  buttonPos: number = 0
): GameStateN {
  return {
    players,
    pot: 0,
    sidePots: [],
    street: Street.PREFLOP,
    buttonPos,
    actionPos: -1, // Set after blinds
    lastAggressor: null,
    lastRaiseAmount: config.bigBlind,
    minRaise: config.bigBlind,
    status: GameStatus.SHUFFLE,
    communityCards: [],
    deck: [],
    currentShuffler: 0,
  };
}
