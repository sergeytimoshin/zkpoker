// Hand Evaluation Circuit
// Proves that a player's hand was correctly evaluated
//
// This circuit verifies:
// 1. The claimed cards match the committed hole cards
// 2. The hand strength calculation is correct
// 3. The hand rank is verified via Merkle proof

use zkpoker_primitives::constants::{CARD_PRIMES, get_rank_prime, get_suit};
use std::hash::pedersen_hash;

// Merkle tree depth for hand rankings (7,462 possible hands fits in 13 levels)
global MERKLE_DEPTH: u32 = 13;

// Main circuit entry point
fn main(
    // === Public inputs ===
    // Merkle root for hand rankings lookup table
    merkle_root: pub Field,
    // Commitment to the player's hole cards
    hole_cards_commitment: pub Field,
    // Commitment to the board cards
    board_cards_commitment: pub Field,
    // The claimed hand rank (0 = royal flush, 7461 = worst hand)
    hand_rank: pub Field,

    // === Private inputs ===
    // Hole cards (indices 0-51)
    hole_card_0: u32,
    hole_card_1: u32,

    // Board cards (indices 0-51)
    board_card_0: u32,
    board_card_1: u32,
    board_card_2: u32,
    board_card_3: u32,
    board_card_4: u32,

    // Which 5 cards form the best hand (booleans)
    use_hole_0: bool,
    use_hole_1: bool,
    use_board_0: bool,
    use_board_1: bool,
    use_board_2: bool,
    use_board_3: bool,
    use_board_4: bool,

    // Is this hand a flush?
    is_flush: bool,

    // Merkle proof for the hand rank
    merkle_proof: [Field; MERKLE_DEPTH],
    merkle_path_bits: [bool; MERKLE_DEPTH],
) {
    // Verify hole cards commitment
    let computed_hole_commitment = pedersen_hash([
        CARD_PRIMES[hole_card_0],
        CARD_PRIMES[hole_card_1]
    ]);
    assert(computed_hole_commitment == hole_cards_commitment, "Hole cards commitment mismatch");

    // Verify board cards commitment
    let computed_board_commitment = pedersen_hash([
        CARD_PRIMES[board_card_0],
        CARD_PRIMES[board_card_1],
        CARD_PRIMES[board_card_2],
        CARD_PRIMES[board_card_3],
        CARD_PRIMES[board_card_4]
    ]);
    assert(computed_board_commitment == board_cards_commitment, "Board cards commitment mismatch");

    // Verify exactly 5 cards are selected
    let card_count = (use_hole_0 as u32) + (use_hole_1 as u32) +
                     (use_board_0 as u32) + (use_board_1 as u32) +
                     (use_board_2 as u32) + (use_board_3 as u32) +
                     (use_board_4 as u32);
    assert(card_count == 5, "Must select exactly 5 cards");

    // Calculate the lookup key (product of rank primes for selected cards)
    let mut lookup_key: Field = 1;

    // Track suits for flush verification
    let mut suit_counts: [u32; 4] = [0, 0, 0, 0];

    // Process hole cards
    if use_hole_0 {
        lookup_key = lookup_key * get_rank_prime(hole_card_0);
        let suit = get_suit(hole_card_0);
        suit_counts[suit] = suit_counts[suit] + 1;
    }
    if use_hole_1 {
        lookup_key = lookup_key * get_rank_prime(hole_card_1);
        let suit = get_suit(hole_card_1);
        suit_counts[suit] = suit_counts[suit] + 1;
    }

    // Process board cards
    if use_board_0 {
        lookup_key = lookup_key * get_rank_prime(board_card_0);
        let suit = get_suit(board_card_0);
        suit_counts[suit] = suit_counts[suit] + 1;
    }
    if use_board_1 {
        lookup_key = lookup_key * get_rank_prime(board_card_1);
        let suit = get_suit(board_card_1);
        suit_counts[suit] = suit_counts[suit] + 1;
    }
    if use_board_2 {
        lookup_key = lookup_key * get_rank_prime(board_card_2);
        let suit = get_suit(board_card_2);
        suit_counts[suit] = suit_counts[suit] + 1;
    }
    if use_board_3 {
        lookup_key = lookup_key * get_rank_prime(board_card_3);
        let suit = get_suit(board_card_3);
        suit_counts[suit] = suit_counts[suit] + 1;
    }
    if use_board_4 {
        lookup_key = lookup_key * get_rank_prime(board_card_4);
        let suit = get_suit(board_card_4);
        suit_counts[suit] = suit_counts[suit] + 1;
    }

    // Verify flush flag is correct
    let has_flush = (suit_counts[0] == 5) | (suit_counts[1] == 5) |
                    (suit_counts[2] == 5) | (suit_counts[3] == 5);
    assert(is_flush == has_flush, "Flush flag mismatch");

    // Compute Merkle leaf: hash(lookup_key, hand_rank, is_flush)
    let leaf = pedersen_hash([lookup_key, hand_rank, is_flush as Field]);

    // Verify Merkle proof
    let computed_root = verify_merkle_proof(leaf, merkle_proof, merkle_path_bits);
    assert(computed_root == merkle_root, "Merkle proof invalid");
}

// Verify a Merkle proof and return the computed root
fn verify_merkle_proof(
    leaf: Field,
    proof: [Field; MERKLE_DEPTH],
    path_bits: [bool; MERKLE_DEPTH],
) -> Field {
    let mut current = leaf;
    for i in 0..MERKLE_DEPTH {
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
