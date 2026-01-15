// Helper to compute showdown circuit values

use zkpoker_primitives::game_state::{GameState, STREET_SHOWDOWN, STATUS_ACTIVE, STATUS_FINISHED};
use std::hash::pedersen_hash;

fn main(
    // Game state before showdown
    stack_p1: u32,
    stack_p2: u32,
    pot: u32,
    dealer: u8,
    // Winner: 0 = P1, 1 = P2
    winner: u8,
) -> pub [Field; 4] {
    // State before showdown
    let state_before = GameState {
        stack_p1,
        stack_p2,
        pot,
        street: STREET_SHOWDOWN,
        current_player: 1,
        last_action: 0,
        last_bet_size: 0,
        street_bet_p1: 0,
        street_bet_p2: 0,
        status: STATUS_ACTIVE,
        dealer,
    };

    // Compute state after (pot goes to winner)
    let (final_p1, final_p2) = if winner == 0 {
        (stack_p1 + pot, stack_p2)
    } else {
        (stack_p1, stack_p2 + pot)
    };

    let state_after = GameState {
        stack_p1: final_p1,
        stack_p2: final_p2,
        pot: 0,
        street: STREET_SHOWDOWN,
        current_player: 0,
        last_action: 0,
        last_bet_size: 0,
        street_bet_p1: 0,
        street_bet_p2: 0,
        status: STATUS_FINISHED,
        dealer,
    };

    let before_commitment = state_before.commitment();
    let after_commitment = state_after.commitment();

    // Card commitments (placeholder hashes)
    let p1_hole = pedersen_hash([1, 2]);
    let p2_hole = pedersen_hash([3, 4]);
    // We don't actually use these in verification, they're just public anchors

    [before_commitment, after_commitment, p1_hole, p2_hole]
}
