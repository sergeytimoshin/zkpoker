/**
 * Game State Management for ZK Poker
 *
 * Handles game state, player actions, and state transitions.
 * Compatible with the circuit_game_action Noir circuit.
 */

import { pedersenHash } from "./pedersen.js";

// Action types
export const ACTION_NULL = 0;
export const ACTION_BET = 1;
export const ACTION_CALL = 2;
export const ACTION_FOLD = 3;
export const ACTION_RAISE = 4;
export const ACTION_CHECK = 5;
export const ACTION_ALL_IN = 6;

// Street (betting round)
export const STREET_PREFLOP = 0;
export const STREET_FLOP = 1;
export const STREET_TURN = 2;
export const STREET_RIVER = 3;
export const STREET_SHOWDOWN = 4;

// Game status
export const STATUS_WAITING = 0;
export const STATUS_ACTIVE = 1;
export const STATUS_FINISHED = 2;

// Betting limits
export const MIN_BET = 1;
export const MIN_RAISE_MULTIPLIER = 2;

/**
 * Game state struct
 */
export interface GameState {
  stackP1: number;      // Player 1 stack (chips)
  stackP2: number;      // Player 2 stack (chips)
  pot: number;          // Current pot
  street: number;       // Current street (0-4)
  currentPlayer: number; // Whose turn (1 or 2)
  lastAction: number;   // Last action taken
  lastBetSize: number;  // Size of last bet/raise
  streetBetP1: number;  // Amount P1 has put in this street
  streetBetP2: number;  // Amount P2 has put in this street
  status: number;       // Game status
  dealer: number;       // Dealer position (1 or 2)
}

/**
 * Action struct
 */
export interface Action {
  actionType: number;
  amount: number;
}

/**
 * Create initial game state
 */
export function createGameState(
  stackP1: number,
  stackP2: number,
  dealer: number
): GameState {
  return {
    stackP1,
    stackP2,
    pot: 0,
    street: STREET_PREFLOP,
    currentPlayer: dealer === 1 ? 2 : 1, // Non-dealer acts first preflop
    lastAction: ACTION_NULL,
    lastBetSize: 0,
    streetBetP1: 0,
    streetBetP2: 0,
    status: STATUS_ACTIVE,
    dealer,
  };
}

/**
 * Post blinds (call at game start)
 */
export function postBlinds(
  state: GameState,
  smallBlind: number,
  bigBlind: number
): GameState {
  const sbPlayer = state.dealer === 1 ? 1 : 2;

  let newStackP1: number;
  let newStackP2: number;
  let newStreetBetP1: number;
  let newStreetBetP2: number;

  if (sbPlayer === 1) {
    newStackP1 = state.stackP1 - smallBlind;
    newStackP2 = state.stackP2 - bigBlind;
    newStreetBetP1 = smallBlind;
    newStreetBetP2 = bigBlind;
  } else {
    newStackP1 = state.stackP1 - bigBlind;
    newStackP2 = state.stackP2 - smallBlind;
    newStreetBetP1 = bigBlind;
    newStreetBetP2 = smallBlind;
  }

  return {
    stackP1: newStackP1,
    stackP2: newStackP2,
    pot: smallBlind + bigBlind,
    street: STREET_PREFLOP,
    currentPlayer: sbPlayer, // Small blind acts first
    lastAction: ACTION_BET, // Big blind counts as a bet
    lastBetSize: bigBlind,
    streetBetP1: newStreetBetP1,
    streetBetP2: newStreetBetP2,
    status: STATUS_ACTIVE,
    dealer: state.dealer,
  };
}

/**
 * Compute hash commitment of game state
 */
export function gameStateCommitment(state: GameState): bigint {
  return pedersenHash([
    BigInt(state.stackP1),
    BigInt(state.stackP2),
    BigInt(state.pot),
    BigInt(state.street),
    BigInt(state.currentPlayer),
    BigInt(state.lastAction),
    BigInt(state.lastBetSize),
    BigInt(state.streetBetP1),
    BigInt(state.streetBetP2),
    BigInt(state.status),
    BigInt(state.dealer),
  ]);
}

/**
 * Get the current player's stack
 */
export function currentStack(state: GameState): number {
  return state.currentPlayer === 1 ? state.stackP1 : state.stackP2;
}

/**
 * Get opponent's current street bet
 */
export function opponentStreetBet(state: GameState): number {
  return state.currentPlayer === 1 ? state.streetBetP2 : state.streetBetP1;
}

/**
 * Get current player's street bet
 */
export function currentStreetBet(state: GameState): number {
  return state.currentPlayer === 1 ? state.streetBetP1 : state.streetBetP2;
}

/**
 * Amount needed to call
 */
export function amountToCall(state: GameState): number {
  const opponentBet = opponentStreetBet(state);
  const myBet = currentStreetBet(state);
  return opponentBet > myBet ? opponentBet - myBet : 0;
}

// Action constructors
export function fold(): Action {
  return { actionType: ACTION_FOLD, amount: 0 };
}

export function check(): Action {
  return { actionType: ACTION_CHECK, amount: 0 };
}

export function call(): Action {
  return { actionType: ACTION_CALL, amount: 0 };
}

export function bet(amount: number): Action {
  return { actionType: ACTION_BET, amount };
}

export function raiseTo(amount: number): Action {
  return { actionType: ACTION_RAISE, amount };
}

export function allIn(): Action {
  return { actionType: ACTION_ALL_IN, amount: 0 };
}

/**
 * Check if an action is valid given the current game state
 */
export function isValidAction(state: GameState, action: Action): boolean {
  // Game must be active
  if (state.status !== STATUS_ACTIVE) return false;

  const toCall = amountToCall(state);
  const stack = currentStack(state);

  switch (action.actionType) {
    case ACTION_FOLD:
      // Can always fold
      return true;

    case ACTION_CHECK:
      // Can only check if nothing to call
      return toCall === 0;

    case ACTION_CALL:
      // Can only call if there's something to call and have enough chips
      return toCall > 0 && stack >= toCall;

    case ACTION_BET:
      // Can only bet if no one has bet yet
      const canBet =
        state.lastAction === ACTION_NULL || state.lastAction === ACTION_CHECK;
      const validBetAmount = action.amount >= MIN_BET && action.amount <= stack;
      return canBet && validBetAmount;

    case ACTION_RAISE:
      // Can only raise if there's a bet to raise
      const canRaise =
        state.lastAction === ACTION_BET ||
        state.lastAction === ACTION_RAISE ||
        state.lastAction === ACTION_ALL_IN;
      const minRaise = state.lastBetSize * MIN_RAISE_MULTIPLIER;
      const validRaiseAmount =
        action.amount >= minRaise && action.amount <= stack;
      return canRaise && validRaiseAmount;

    case ACTION_ALL_IN:
      // Can always go all-in if you have chips
      return stack > 0;

    default:
      return false;
  }
}

/**
 * Apply an action to the game state and return the new state
 */
export function applyAction(state: GameState, action: Action): GameState {
  const stack = currentStack(state);
  const toCall = amountToCall(state);
  const myStreetBet = currentStreetBet(state);

  // Compute chips to add
  let chipsToAdd: number;
  switch (action.actionType) {
    case ACTION_FOLD:
    case ACTION_CHECK:
      chipsToAdd = 0;
      break;
    case ACTION_CALL:
      chipsToAdd = toCall > stack ? stack : toCall;
      break;
    case ACTION_BET:
      chipsToAdd = action.amount;
      break;
    case ACTION_RAISE:
      // Raise TO amount minus what we've already bet
      chipsToAdd = action.amount - myStreetBet;
      break;
    case ACTION_ALL_IN:
      chipsToAdd = stack;
      break;
    default:
      chipsToAdd = 0;
  }

  // Update stacks
  const newStackP1 =
    state.currentPlayer === 1 ? state.stackP1 - chipsToAdd : state.stackP1;
  const newStackP2 =
    state.currentPlayer === 2 ? state.stackP2 - chipsToAdd : state.stackP2;

  // Update street bets
  let newStreetBetP1 =
    state.currentPlayer === 1
      ? state.streetBetP1 + chipsToAdd
      : state.streetBetP1;
  let newStreetBetP2 =
    state.currentPlayer === 2
      ? state.streetBetP2 + chipsToAdd
      : state.streetBetP2;

  // Update pot
  const newPot = state.pot + chipsToAdd;

  // Determine new status
  const newStatus =
    action.actionType === ACTION_FOLD ? STATUS_FINISHED : state.status;

  // Check if street is complete
  const betsEqual = newStreetBetP1 === newStreetBetP2;
  const bothActed = state.lastAction !== ACTION_NULL;
  const isCallAction = action.actionType === ACTION_CALL;
  const isCheckAction = action.actionType === ACTION_CHECK;
  const streetComplete = betsEqual && bothActed && (isCallAction || isCheckAction);

  let newStreet: number;
  let newLastAction: number;
  let newLastBet: number;
  let newCurrentPlayer: number;

  if (streetComplete && state.street < STREET_SHOWDOWN) {
    // Move to next street
    newStreet = state.street + 1;
    newLastAction = ACTION_NULL;
    newLastBet = 0;
    newStreetBetP1 = 0;
    newStreetBetP2 = 0;
    newCurrentPlayer = state.dealer === 1 ? 2 : 1; // Non-dealer acts first post-flop
  } else {
    // Stay on current street
    newStreet = state.street;
    newLastAction = action.actionType;

    // For BET/RAISE, update last_bet_size
    if (action.actionType === ACTION_RAISE) {
      newLastBet = action.amount;
    } else if (action.actionType === ACTION_BET) {
      newLastBet = chipsToAdd;
    } else {
      newLastBet = state.lastBetSize;
    }

    newCurrentPlayer = state.currentPlayer === 1 ? 2 : 1;
  }

  return {
    stackP1: newStackP1,
    stackP2: newStackP2,
    pot: newPot,
    street: newStreet,
    currentPlayer: newCurrentPlayer,
    lastAction: newLastAction,
    lastBetSize: newLastBet,
    streetBetP1: newStreetBetP1,
    streetBetP2: newStreetBetP2,
    status: newStatus,
    dealer: state.dealer,
  };
}

/**
 * Get action type name
 */
export function actionTypeName(actionType: number): string {
  switch (actionType) {
    case ACTION_NULL:
      return "null";
    case ACTION_BET:
      return "bet";
    case ACTION_CALL:
      return "call";
    case ACTION_FOLD:
      return "fold";
    case ACTION_RAISE:
      return "raise";
    case ACTION_CHECK:
      return "check";
    case ACTION_ALL_IN:
      return "all-in";
    default:
      return "unknown";
  }
}

/**
 * Get street name
 */
export function streetName(street: number): string {
  switch (street) {
    case STREET_PREFLOP:
      return "preflop";
    case STREET_FLOP:
      return "flop";
    case STREET_TURN:
      return "turn";
    case STREET_RIVER:
      return "river";
    case STREET_SHOWDOWN:
      return "showdown";
    default:
      return "unknown";
  }
}
