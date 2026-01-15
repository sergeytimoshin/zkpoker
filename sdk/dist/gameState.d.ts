/**
 * Game State Management for ZK Poker
 *
 * Handles game state, player actions, and state transitions.
 * Compatible with the circuit_game_action Noir circuit.
 */
export declare const ACTION_NULL = 0;
export declare const ACTION_BET = 1;
export declare const ACTION_CALL = 2;
export declare const ACTION_FOLD = 3;
export declare const ACTION_RAISE = 4;
export declare const ACTION_CHECK = 5;
export declare const ACTION_ALL_IN = 6;
export declare const STREET_PREFLOP = 0;
export declare const STREET_FLOP = 1;
export declare const STREET_TURN = 2;
export declare const STREET_RIVER = 3;
export declare const STREET_SHOWDOWN = 4;
export declare const STATUS_WAITING = 0;
export declare const STATUS_ACTIVE = 1;
export declare const STATUS_FINISHED = 2;
export declare const MIN_BET = 1;
export declare const MIN_RAISE_MULTIPLIER = 2;
/**
 * Game state struct
 */
export interface GameState {
    stackP1: number;
    stackP2: number;
    pot: number;
    street: number;
    currentPlayer: number;
    lastAction: number;
    lastBetSize: number;
    streetBetP1: number;
    streetBetP2: number;
    status: number;
    dealer: number;
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
export declare function createGameState(stackP1: number, stackP2: number, dealer: number): GameState;
/**
 * Post blinds (call at game start)
 */
export declare function postBlinds(state: GameState, smallBlind: number, bigBlind: number): GameState;
/**
 * Compute hash commitment of game state
 */
export declare function gameStateCommitment(state: GameState): bigint;
/**
 * Get the current player's stack
 */
export declare function currentStack(state: GameState): number;
/**
 * Get opponent's current street bet
 */
export declare function opponentStreetBet(state: GameState): number;
/**
 * Get current player's street bet
 */
export declare function currentStreetBet(state: GameState): number;
/**
 * Amount needed to call
 */
export declare function amountToCall(state: GameState): number;
export declare function fold(): Action;
export declare function check(): Action;
export declare function call(): Action;
export declare function bet(amount: number): Action;
export declare function raiseTo(amount: number): Action;
export declare function allIn(): Action;
/**
 * Check if an action is valid given the current game state
 */
export declare function isValidAction(state: GameState, action: Action): boolean;
/**
 * Apply an action to the game state and return the new state
 */
export declare function applyAction(state: GameState, action: Action): GameState;
/**
 * Get action type name
 */
export declare function actionTypeName(actionType: number): string;
/**
 * Get street name
 */
export declare function streetName(street: number): string;
//# sourceMappingURL=gameState.d.ts.map