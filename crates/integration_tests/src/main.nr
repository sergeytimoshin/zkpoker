// Integration Tests for ZK Poker
// Full game flow: Deal -> Shuffle/Mask -> Betting -> Showdown
//
// This tests the complete poker hand lifecycle using all primitives

use zkpoker_primitives::card::{Card, card_index_to_point, points_equal};
use zkpoker_primitives::elgamal::{add_player_and_mask, partial_unmask};
use zkpoker_primitives::game_state::{
    GameState, Action,
    is_valid_action, apply_action,
    STREET_PREFLOP, STREET_FLOP, STREET_TURN, STREET_RIVER, STREET_SHOWDOWN,
    STATUS_ACTIVE, STATUS_FINISHED
};
use std::embedded_curve_ops::EmbeddedCurveScalar;

// Dummy main for bin type
fn main() {}

// ==================== Test: Full 2-Player Poker Hand ====================

#[test]
fn test_full_poker_hand() {
    // === Phase 1: Setup ===
    // Two players with 100 chips each, Player 1 is dealer
    let initial_state = GameState::new(100, 100, 1);
    assert(initial_state.status == STATUS_ACTIVE);

    // Post blinds: SB = 1, BB = 2
    let state_after_blinds = initial_state.post_blinds(1, 2);
    assert(state_after_blinds.pot == 3);
    assert(state_after_blinds.stack_p1 == 99);  // Posted SB
    assert(state_after_blinds.stack_p2 == 98);  // Posted BB

    // === Phase 2: Deal Cards (Create and Mask) ===
    // Card indices: 0 = 2s, 1 = 3s, 2 = 4s, etc. (s=spades)
    // Player 1 hole cards: indices 0, 1
    // Player 2 hole cards: indices 2, 3

    let p1_secret = EmbeddedCurveScalar::new(11111, 0);
    let p2_secret = EmbeddedCurveScalar::new(22222, 0);
    let p1_nonce = EmbeddedCurveScalar::new(33333, 0);
    let p2_nonce = EmbeddedCurveScalar::new(44444, 0);

    // Create P1's first hole card
    let card0_point = card_index_to_point(0);
    let card0 = Card::new(card0_point);

    // Both players mask the card
    let card0_masked_p1 = add_player_and_mask(card0, p1_secret, p1_nonce);
    let card0_masked_p2 = add_player_and_mask(card0_masked_p1, p2_secret, p2_nonce);

    // Verify card is masked (pk not at infinity)
    assert(!card0_masked_p2.pk.is_infinite);

    // === Phase 3: Preflop Betting ===
    // P1 (SB) raises to 4
    let raise_action = Action::raise_to(4);
    assert(is_valid_action(state_after_blinds, raise_action));

    let state_after_raise = apply_action(state_after_blinds, raise_action);
    assert(state_after_raise.pot == 6);  // 1 + 2 + 3 (raise to 4, already had 1)
    assert(state_after_raise.stack_p1 == 96);

    // P2 (BB) calls the raise
    let call_action = Action::call();
    assert(is_valid_action(state_after_raise, call_action));

    let state_after_call = apply_action(state_after_raise, call_action);
    // Street should advance to flop (bets equal after call)
    assert(state_after_call.street == STREET_FLOP);
    assert(state_after_call.pot == 8);  // 4 + 4

    // === Phase 4: Flop Betting ===
    // P2 acts first post-flop (non-dealer)
    assert(state_after_call.current_player == 2);

    // P2 checks
    let state_flop_1 = apply_action(state_after_call, Action::check());

    // P1 checks
    let state_flop_2 = apply_action(state_flop_1, Action::check());
    assert(state_flop_2.street == STREET_TURN);

    // === Phase 5: Turn Betting ===
    // P2 bets 4
    let bet_action = Action::bet(4);
    assert(is_valid_action(state_flop_2, bet_action));

    let state_turn_1 = apply_action(state_flop_2, bet_action);
    assert(state_turn_1.pot == 12);  // 8 + 4

    // P1 calls 4
    let state_turn_2 = apply_action(state_turn_1, Action::call());
    assert(state_turn_2.pot == 16);  // 12 + 4
    assert(state_turn_2.street == STREET_RIVER);

    // === Phase 6: River Betting ===
    // P2 checks
    let state_river_1 = apply_action(state_turn_2, Action::check());

    // P1 bets 10
    let river_bet = Action::bet(10);
    let state_river_2 = apply_action(state_river_1, river_bet);
    assert(state_river_2.pot == 26);  // 16 + 10

    // P2 calls 10
    let state_river_3 = apply_action(state_river_2, Action::call());
    assert(state_river_3.pot == 36);  // 26 + 10
    assert(state_river_3.street == STREET_SHOWDOWN);

    // === Phase 7: Unmask Cards for Showdown ===
    // Both players unmask the card (reverse order)
    let card0_unmask_p2 = partial_unmask(card0_masked_p2, p2_secret);
    let card0_unmask_p1 = partial_unmask(card0_unmask_p2, p1_secret);

    // Verify card is fully unmasked
    assert(card0_unmask_p1.pk.is_infinite);

    // Verify original card point is recovered
    assert(points_equal(card0_unmask_p1.msg, card0_point));

    // === Phase 8: Verify Final State ===
    // At showdown with pot of 36
    assert(state_river_3.status == STATUS_ACTIVE);
    assert(state_river_3.pot == 36);

    // Stacks: P1 = 100 - 4 - 4 - 10 = 82, P2 = 100 - 4 - 4 - 10 = 82
    assert(state_river_3.stack_p1 == 82);
    assert(state_river_3.stack_p2 == 82);
}

// ==================== Test: Fold Ends Hand ====================

#[test]
fn test_fold_ends_hand() {
    let state = GameState::new(100, 100, 1).post_blinds(1, 2);

    // P1 raises to 6
    let raise = Action::raise_to(6);
    let state_raised = apply_action(state, raise);

    // P2 folds
    let fold = Action::fold();
    assert(is_valid_action(state_raised, fold));

    let state_folded = apply_action(state_raised, fold);
    assert(state_folded.status == STATUS_FINISHED);
}

// ==================== Test: All-In Scenario ====================

#[test]
fn test_all_in() {
    let state = GameState::new(50, 50, 1).post_blinds(1, 2);

    // P1 goes all-in
    let all_in = Action::all_in();
    assert(is_valid_action(state, all_in));

    let state_allin = apply_action(state, all_in);
    // P1 had 49 chips after posting SB, now 0
    assert(state_allin.stack_p1 == 0);
    assert(state_allin.pot == 52);  // 1 + 2 + 49
}

// ==================== Test: Card Masking Commutativity ====================

#[test]
fn test_mask_unmask_order_independence() {
    // Create a card
    let card_point = card_index_to_point(10);  // Jack of some suit
    let card = Card::new(card_point);

    // Three players with different secrets
    let p1_secret = EmbeddedCurveScalar::new(111, 0);
    let p2_secret = EmbeddedCurveScalar::new(222, 0);
    let p3_secret = EmbeddedCurveScalar::new(333, 0);

    let n1 = EmbeddedCurveScalar::new(1000, 0);
    let n2 = EmbeddedCurveScalar::new(2000, 0);
    let n3 = EmbeddedCurveScalar::new(3000, 0);

    // Mask in order: P1, P2, P3
    let m1 = add_player_and_mask(card, p1_secret, n1);
    let m2 = add_player_and_mask(m1, p2_secret, n2);
    let m3 = add_player_and_mask(m2, p3_secret, n3);

    // Unmask in different order: P2, P1, P3
    let u1 = partial_unmask(m3, p2_secret);
    let u2 = partial_unmask(u1, p1_secret);
    let u3 = partial_unmask(u2, p3_secret);

    // Should recover original card
    assert(u3.pk.is_infinite);
    assert(points_equal(u3.msg, card_point));
}

// ==================== Test: Street Progression ====================

#[test]
fn test_street_progression() {
    let state = GameState::new(100, 100, 1).post_blinds(1, 2);
    assert(state.street == STREET_PREFLOP);

    // P1 calls, P2 checks -> Flop
    let s1 = apply_action(state, Action::call());
    let s2 = apply_action(s1, Action::check());
    assert(s2.street == STREET_FLOP);

    // Both check -> Turn
    let s3 = apply_action(s2, Action::check());
    let s4 = apply_action(s3, Action::check());
    assert(s4.street == STREET_TURN);

    // Both check -> River
    let s5 = apply_action(s4, Action::check());
    let s6 = apply_action(s5, Action::check());
    assert(s6.street == STREET_RIVER);

    // Both check -> Showdown
    let s7 = apply_action(s6, Action::check());
    let s8 = apply_action(s7, Action::check());
    assert(s8.street == STREET_SHOWDOWN);
}

// ==================== Test: Multiple Cards ====================

#[test]
fn test_multiple_card_masking() {
    let p1_secret = EmbeddedCurveScalar::new(12345, 0);
    let p2_secret = EmbeddedCurveScalar::new(67890, 0);

    // Create 5 cards (a hand)
    let mut original_points: [std::embedded_curve_ops::EmbeddedCurvePoint; 5] = [
        card_index_to_point(0),
        card_index_to_point(13),  // Different suits
        card_index_to_point(26),
        card_index_to_point(39),
        card_index_to_point(51),
    ];

    // Mask all cards
    let mut masked_cards: [Card; 5] = [Card::new(original_points[0]); 5];
    for i in 0..5 {
        let card = Card::new(original_points[i]);
        let nonce1 = EmbeddedCurveScalar::new((i as Field + 1) * 100, 0);
        let nonce2 = EmbeddedCurveScalar::new((i as Field + 1) * 200, 0);

        let m1 = add_player_and_mask(card, p1_secret, nonce1);
        let m2 = add_player_and_mask(m1, p2_secret, nonce2);
        masked_cards[i] = m2;
    }

    // Unmask all and verify
    for i in 0..5 {
        let u1 = partial_unmask(masked_cards[i], p2_secret);
        let u2 = partial_unmask(u1, p1_secret);

        assert(u2.pk.is_infinite);
        assert(points_equal(u2.msg, original_points[i]));
    }
}

// ==================== Test: Bet/Raise Validation ====================

#[test]
fn test_bet_raise_validation() {
    let state = GameState::new(100, 100, 1).post_blinds(1, 2);

    // Can't check when there's a bet to call
    let check = Action::check();
    assert(!is_valid_action(state, check));

    // Can call
    let call = Action::call();
    assert(is_valid_action(state, call));

    // Can raise (min 2x = 4)
    let raise_ok = Action::raise_to(4);
    assert(is_valid_action(state, raise_ok));

    // Can't raise below min (2x last bet)
    let raise_low = Action::raise_to(3);
    assert(!is_valid_action(state, raise_low));
}
