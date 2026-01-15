// Game Action Circuit
// Proves that a game action is valid and correctly transitions the state
//
// This circuit verifies:
// 1. The action is valid given the current game state
// 2. The state transition is correct
// 3. The player is authorized to take this action

use zkpoker_primitives::game_state::{
    GameState, Action,
    is_valid_action, apply_action
};

// Main circuit entry point
fn main(
    // === Public inputs ===
    // Commitment to game state before action
    state_before_commitment: pub Field,
    // Commitment to game state after action
    state_after_commitment: pub Field,
    // Hash of the acting player's public key
    player_hash: pub Field,

    // === Private inputs ===
    // Game state before action
    stack_p1_before: u32,
    stack_p2_before: u32,
    pot_before: u32,
    street_before: u8,
    current_player_before: u8,
    last_action_before: u8,
    last_bet_size_before: u32,
    street_bet_p1_before: u32,
    street_bet_p2_before: u32,
    status_before: u8,
    dealer: u8,

    // Action being taken
    action_type: u8,
    action_amount: u32,

    // Player identification
    player1_hash: Field,
    player2_hash: Field,
) {
    // Reconstruct game state before
    let state_before = GameState {
        stack_p1: stack_p1_before,
        stack_p2: stack_p2_before,
        pot: pot_before,
        street: street_before,
        current_player: current_player_before,
        last_action: last_action_before,
        last_bet_size: last_bet_size_before,
        street_bet_p1: street_bet_p1_before,
        street_bet_p2: street_bet_p2_before,
        status: status_before,
        dealer,
    };

    // Verify state before commitment
    let computed_before = state_before.commitment();
    assert(computed_before == state_before_commitment, "State before commitment mismatch");

    // Verify it's the correct player's turn
    let expected_player_hash = if current_player_before == 1 {
        player1_hash
    } else {
        player2_hash
    };
    assert(player_hash == expected_player_hash, "Wrong player taking action");

    // Construct the action
    let action = Action {
        action_type,
        amount: action_amount,
    };

    // Verify action is valid
    let valid = is_valid_action(state_before, action);
    assert(valid, "Invalid action for current game state");

    // Apply action to get new state
    let state_after = apply_action(state_before, action);

    // Verify state after commitment
    let computed_after = state_after.commitment();
    assert(computed_after == state_after_commitment, "State after commitment mismatch");
}
