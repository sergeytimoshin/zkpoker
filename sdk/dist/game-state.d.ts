import type { GameState, Action, Scalar, MaskedCard } from './types.js';
import { ACTION_NULL, ACTION_BET, ACTION_CALL, ACTION_FOLD, ACTION_RAISE, ACTION_CHECK, ACTION_ALL_IN, STREET_PREFLOP, STREET_SHOWDOWN, STATUS_ACTIVE, STATUS_FINISHED } from './types.js';
export { ACTION_NULL, ACTION_BET, ACTION_CALL, ACTION_FOLD, ACTION_RAISE, ACTION_CHECK, ACTION_ALL_IN, STREET_PREFLOP, STREET_SHOWDOWN, STATUS_ACTIVE, STATUS_FINISHED };
import { pedersenHash } from './pedersen.js';
export { pedersenHash };
export declare function createGameState(stackP1: number, stackP2: number, dealer: number): GameState;
export declare function postBlinds(state: GameState, smallBlind: number, bigBlind: number): GameState;
export declare function gameStateCommitment(state: GameState): bigint;
export declare function applyAction(state: GameState, action: Action): GameState;
export declare function cardCommitment(card: MaskedCard): bigint;
export declare function toHex(value: bigint): string;
export declare function generateGameActionProverToml(params: {
    stateBefore: GameState;
    stateAfter: GameState;
    player1PubKey: {
        x: bigint;
        y: bigint;
    };
    player2PubKey: {
        x: bigint;
        y: bigint;
    };
    actionType: number;
    actionAmount: number;
}): string;
export declare function generateShuffleProverToml(params: {
    cardsBefore: MaskedCard[];
    permutation: number[];
    playerSecret: Scalar;
    nonces: Scalar[];
    maskedCards: MaskedCard[];
}): string;
export declare function randomPermutation(n: number): number[];
export declare function randomScalarPair(): Scalar;
//# sourceMappingURL=game-state.d.ts.map