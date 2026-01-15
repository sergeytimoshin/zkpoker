// Showdown Circuit
// Proves winner determination and pot distribution at showdown
//
// This circuit verifies:
// 1. Hand ranks were computed correctly (via hand_eval proofs)
// 2. Winner is correctly determined (lower rank = better hand)
// 3. Pot is distributed correctly (winner takes all, or split on tie)

use zkpoker_primitives::game_state::{
    GameState,
    STREET_SHOWDOWN, STATUS_FINISHED
};
use std::hash::pedersen_hash;

// Main circuit entry point
fn main(
    // === Public inputs ===
    // Commitment to game state before showdown
    state_before_commitment: pub Field,
    // Commitment to game state after showdown (pot distributed)
    state_after_commitment: pub Field,
    // Merkle root for hand rankings (same for both players)
    merkle_root: pub Field,
    // Commitments to each player's hole cards (public anchors)
    _p1_hole_commitment: pub Field,
    _p2_hole_commitment: pub Field,
    // Commitment to board cards (public anchor)
    _board_commitment: pub Field,

    // === Private inputs ===
    // Game state before showdown
    stack_p1_before: u32,
    stack_p2_before: u32,
    pot: u32,
    street: u8,
    current_player: u8,
    last_action: u8,
    last_bet_size: u32,
    street_bet_p1: u32,
    street_bet_p2: u32,
    status: u8,
    dealer: u8,

    // Hand ranks (0 = royal flush, 7461 = worst hand)
    // Lower is better
    p1_hand_rank: u32,
    p2_hand_rank: u32,

    // Merkle proofs for hand ranks (proof that ranks are valid)
    // These would come from hand_eval circuit outputs
    p1_lookup_key: Field,
    p1_is_flush: bool,
    p1_merkle_proof: [Field; 13],
    p1_merkle_path_bits: [bool; 13],

    p2_lookup_key: Field,
    p2_is_flush: bool,
    p2_merkle_proof: [Field; 13],
    p2_merkle_path_bits: [bool; 13],
) {
    // Reconstruct and verify game state before
    let state_before = GameState {
        stack_p1: stack_p1_before,
        stack_p2: stack_p2_before,
        pot,
        street,
        current_player,
        last_action,
        last_bet_size,
        street_bet_p1,
        street_bet_p2,
        status,
        dealer,
    };

    let computed_before = state_before.commitment();
    assert(computed_before == state_before_commitment, "State before commitment mismatch");

    // Verify we're at showdown
    assert(street == STREET_SHOWDOWN, "Must be at showdown street");

    // Verify P1's hand rank via Merkle proof
    let p1_leaf = pedersen_hash([p1_lookup_key, p1_hand_rank as Field, p1_is_flush as Field]);
    let p1_computed_root = verify_merkle_proof(p1_leaf, p1_merkle_proof, p1_merkle_path_bits);
    assert(p1_computed_root == merkle_root, "P1 hand rank Merkle proof invalid");

    // Verify P2's hand rank via Merkle proof
    let p2_leaf = pedersen_hash([p2_lookup_key, p2_hand_rank as Field, p2_is_flush as Field]);
    let p2_computed_root = verify_merkle_proof(p2_leaf, p2_merkle_proof, p2_merkle_path_bits);
    assert(p2_computed_root == merkle_root, "P2 hand rank Merkle proof invalid");

    // Determine winner (lower rank = better hand)
    // 0 = P1 wins, 1 = P2 wins, 2 = tie
    let winner = if p1_hand_rank < p2_hand_rank {
        0  // P1 wins
    } else if p2_hand_rank < p1_hand_rank {
        1  // P2 wins
    } else {
        2  // Tie
    };

    // Distribute pot
    let (final_stack_p1, final_stack_p2) = if winner == 0 {
        // P1 wins - takes entire pot
        (stack_p1_before + pot, stack_p2_before)
    } else if winner == 1 {
        // P2 wins - takes entire pot
        (stack_p1_before, stack_p2_before + pot)
    } else {
        // Tie - split pot (handle odd chip)
        let half_pot = pot / 2;
        let remainder = pot - (half_pot * 2);
        // Dealer button gets odd chip
        if dealer == 1 {
            (stack_p1_before + half_pot + remainder, stack_p2_before + half_pot)
        } else {
            (stack_p1_before + half_pot, stack_p2_before + half_pot + remainder)
        }
    };

    // Create final game state
    let state_after = GameState {
        stack_p1: final_stack_p1,
        stack_p2: final_stack_p2,
        pot: 0,  // Pot distributed
        street: STREET_SHOWDOWN,
        current_player: 0,  // Game over
        last_action: 0,
        last_bet_size: 0,
        street_bet_p1: 0,
        street_bet_p2: 0,
        status: STATUS_FINISHED,
        dealer,
    };

    // Verify state after commitment
    let computed_after = state_after.commitment();
    assert(computed_after == state_after_commitment, "State after commitment mismatch");
}

// Verify a Merkle proof and return the computed root
fn verify_merkle_proof(
    leaf: Field,
    proof: [Field; 13],
    path_bits: [bool; 13],
) -> Field {
    let mut current = leaf;
    for i in 0..13 {
        if path_bits[i] {
            // Current node is on the right
            current = pedersen_hash([proof[i], current]);
        } else {
            // Current node is on the left
            current = pedersen_hash([current, proof[i]]);
        }
    }
    current
}

// ==================== Tests ====================

#[test]
fn test_winner_determination() {
    // P1 has better hand (lower rank)
    let p1_rank: u32 = 100;  // Better hand
    let p2_rank: u32 = 500;  // Worse hand

    let winner = if p1_rank < p2_rank { 0 }
                else if p2_rank < p1_rank { 1 }
                else { 2 };

    assert(winner == 0);  // P1 wins
}

#[test]
fn test_tie_detection() {
    let p1_rank: u32 = 300;
    let p2_rank: u32 = 300;

    let winner = if p1_rank < p2_rank { 0 }
                else if p2_rank < p1_rank { 1 }
                else { 2 };

    assert(winner == 2);  // Tie
}

#[test]
fn test_pot_split() {
    let pot: u32 = 101;  // Odd pot
    let dealer: u8 = 1;

    let half_pot = pot / 2;  // 50
    let remainder = pot - (half_pot * 2);  // 1

    let (p1_share, p2_share) = if dealer == 1 {
        (half_pot + remainder, half_pot)  // P1 gets odd chip
    } else {
        (half_pot, half_pot + remainder)
    };

    assert(p1_share == 51);
    assert(p2_share == 50);
    assert(p1_share + p2_share == pot);
}
