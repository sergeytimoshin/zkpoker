import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from '../src/game/GameEngine.js';
import {
  ActionType,
  Street,
  GameStatus,
  DEFAULT_GAME_CONFIG,
  createPlayerState,
} from '../src/types/index.js';

describe('GameEngine', () => {
  let engine: GameEngine;

  describe('2-player heads up', () => {
    beforeEach(() => {
      const players = [
        createPlayerState('p1', 0, 100, null),
        createPlayerState('p2', 1, 100, null),
      ];
      engine = new GameEngine(players, DEFAULT_GAME_CONFIG);
    });

    it('should create initial game state', () => {
      const state = engine.getState();
      expect(state.players.length).toBe(2);
      expect(state.pot).toBe(0);
      expect(state.street).toBe(Street.PREFLOP);
      expect(state.status).toBe(GameStatus.SHUFFLE);
    });

    it('should post blinds correctly for heads up', () => {
      engine.postBlinds();
      const state = engine.getState();

      // In heads up, button (seat 0) posts small blind
      expect(state.players[0].streetBet).toBe(1); // SB
      expect(state.players[1].streetBet).toBe(2); // BB
      expect(state.pot).toBe(3);

      // Button acts first preflop in heads up
      expect(state.actionPos).toBe(0);
    });

    it('should handle fold action', () => {
      engine.postBlinds();

      const result = engine.applyAction({
        playerId: 'p1',
        type: ActionType.FOLD,
        amount: 0,
      });

      expect(result.success).toBe(true);

      const state = engine.getState();
      expect(state.players[0].folded).toBe(true);
      expect(state.status).toBe(GameStatus.FINISHED);
    });

    it('should handle call action', () => {
      engine.postBlinds();

      const result = engine.applyAction({
        playerId: 'p1',
        type: ActionType.CALL,
        amount: 1, // Call 1 more to match BB
      });

      expect(result.success).toBe(true);

      const state = engine.getState();
      expect(state.players[0].streetBet).toBe(2);
      expect(state.players[0].stack).toBe(98);
      expect(state.pot).toBe(4);
    });

    it('should handle check action', () => {
      engine.postBlinds();

      // P1 calls
      engine.applyAction({
        playerId: 'p1',
        type: ActionType.CALL,
        amount: 1,
      });

      // P2 (BB) can check
      const result = engine.applyAction({
        playerId: 'p2',
        type: ActionType.CHECK,
        amount: 0,
      });

      expect(result.success).toBe(true);

      const state = engine.getState();
      expect(state.street).toBe(Street.FLOP);
    });

    it('should handle bet action', () => {
      engine.postBlinds();

      // P1 calls
      engine.applyAction({ playerId: 'p1', type: ActionType.CALL, amount: 1 });

      // P2 checks to end preflop
      engine.applyAction({ playerId: 'p2', type: ActionType.CHECK, amount: 0 });

      // Now on flop, P2 acts first (first after button)
      const state = engine.getState();
      expect(state.street).toBe(Street.FLOP);
      expect(state.actionPos).toBe(1); // P2

      const result = engine.applyAction({
        playerId: 'p2',
        type: ActionType.BET,
        amount: 4,
      });

      expect(result.success).toBe(true);
      expect(state.pot).toBe(8); // 4 from preflop + 4 bet
    });

    it('should handle raise action', () => {
      engine.postBlinds();

      // P1 raises to 6 (BB is 2, min raise is 2 more = 4, total 6)
      const result = engine.applyAction({
        playerId: 'p1',
        type: ActionType.RAISE,
        amount: 6, // Total bet of 6
      });

      expect(result.success).toBe(true);

      const state = engine.getState();
      expect(state.players[0].streetBet).toBe(6);
      expect(state.pot).toBe(8); // 1 SB + 2 BB + 5 raise
    });

    it('should handle all-in action', () => {
      engine.postBlinds();

      const result = engine.applyAction({
        playerId: 'p1',
        type: ActionType.ALL_IN,
        amount: 0,
      });

      expect(result.success).toBe(true);

      const state = engine.getState();
      expect(state.players[0].stack).toBe(0);
      expect(state.players[0].allIn).toBe(true);
      expect(state.players[0].streetBet).toBe(100);
    });

    it('should reject invalid action - not your turn', () => {
      engine.postBlinds();

      const result = engine.applyAction({
        playerId: 'p2', // Not P2's turn
        type: ActionType.FOLD,
        amount: 0,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Not your turn');
    });

    it('should advance through all streets', () => {
      engine.postBlinds();

      // Preflop: P1 calls, P2 checks
      engine.applyAction({ playerId: 'p1', type: ActionType.CALL, amount: 1 });
      engine.applyAction({ playerId: 'p2', type: ActionType.CHECK, amount: 0 });

      expect(engine.getState().street).toBe(Street.FLOP);

      // Flop: P2 checks, P1 checks
      engine.applyAction({ playerId: 'p2', type: ActionType.CHECK, amount: 0 });
      engine.applyAction({ playerId: 'p1', type: ActionType.CHECK, amount: 0 });

      expect(engine.getState().street).toBe(Street.TURN);

      // Turn: P2 checks, P1 checks
      engine.applyAction({ playerId: 'p2', type: ActionType.CHECK, amount: 0 });
      engine.applyAction({ playerId: 'p1', type: ActionType.CHECK, amount: 0 });

      expect(engine.getState().street).toBe(Street.RIVER);

      // River: P2 checks, P1 checks
      engine.applyAction({ playerId: 'p2', type: ActionType.CHECK, amount: 0 });
      engine.applyAction({ playerId: 'p1', type: ActionType.CHECK, amount: 0 });

      expect(engine.getState().street).toBe(Street.SHOWDOWN);
      expect(engine.getState().status).toBe(GameStatus.SHOWDOWN);
    });
  });

  describe('multi-player (6 players)', () => {
    beforeEach(() => {
      const players = [
        createPlayerState('p1', 0, 100, null),
        createPlayerState('p2', 1, 100, null),
        createPlayerState('p3', 2, 100, null),
        createPlayerState('p4', 3, 100, null),
        createPlayerState('p5', 4, 100, null),
        createPlayerState('p6', 5, 100, null),
      ];
      engine = new GameEngine(players, DEFAULT_GAME_CONFIG);
    });

    it('should post blinds correctly for 6 players', () => {
      engine.postBlinds();
      const state = engine.getState();

      // Button at 0, SB at 1, BB at 2, UTG at 3
      expect(state.players[1].streetBet).toBe(1); // SB
      expect(state.players[2].streetBet).toBe(2); // BB
      expect(state.pot).toBe(3);
      expect(state.actionPos).toBe(3); // UTG
    });

    it('should handle multiple folds', () => {
      engine.postBlinds();

      // UTG folds
      engine.applyAction({ playerId: 'p4', type: ActionType.FOLD, amount: 0 });
      expect(engine.getState().actionPos).toBe(4);

      // P5 folds
      engine.applyAction({ playerId: 'p5', type: ActionType.FOLD, amount: 0 });
      expect(engine.getState().actionPos).toBe(5);

      // P6 folds
      engine.applyAction({ playerId: 'p6', type: ActionType.FOLD, amount: 0 });
      expect(engine.getState().actionPos).toBe(0);

      // Button folds
      engine.applyAction({ playerId: 'p1', type: ActionType.FOLD, amount: 0 });
      expect(engine.getState().actionPos).toBe(1);

      // SB folds - BB wins
      engine.applyAction({ playerId: 'p2', type: ActionType.FOLD, amount: 0 });

      expect(engine.getState().status).toBe(GameStatus.FINISHED);
    });

    it('should track active players correctly', () => {
      engine.postBlinds();

      expect(engine.getActivePlayerCount()).toBe(6);

      // UTG folds
      engine.applyAction({ playerId: 'p4', type: ActionType.FOLD, amount: 0 });
      expect(engine.getActivePlayerCount()).toBe(5);
    });
  });

  describe('valid actions', () => {
    beforeEach(() => {
      const players = [
        createPlayerState('p1', 0, 100, null),
        createPlayerState('p2', 1, 100, null),
      ];
      engine = new GameEngine(players, DEFAULT_GAME_CONFIG);
      engine.postBlinds();
    });

    it('should return correct valid actions for preflop caller', () => {
      const actions = engine.getValidActions();

      expect(actions).toContain(ActionType.FOLD);
      expect(actions).toContain(ActionType.CALL);
      expect(actions).toContain(ActionType.RAISE);
      expect(actions).toContain(ActionType.ALL_IN);
      expect(actions).not.toContain(ActionType.CHECK);
    });

    it('should return correct valid actions for BB after call', () => {
      engine.applyAction({ playerId: 'p1', type: ActionType.CALL, amount: 1 });

      const actions = engine.getValidActions();

      expect(actions).toContain(ActionType.FOLD);
      expect(actions).toContain(ActionType.CHECK);
      expect(actions).toContain(ActionType.RAISE);
      expect(actions).toContain(ActionType.ALL_IN);
    });
  });
});
