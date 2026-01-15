// Shuffle Verification Circuit
// Proves that a deck was correctly shuffled and masked by a player
//
// This circuit verifies:
// 1. The permutation is valid (each position maps to a unique target)
// 2. Each card was correctly masked during shuffle
// 3. The deck commitment changed appropriately
//
// IMPORTANT: Sunspot/gnark limitation
// When using sunspot for proof generation, input points at infinity (is_infinite=true)
// will cause proof generation to fail. The first shuffle (on an unmasked deck where
// epk and pk are at infinity) will fail with sunspot.
//
// Workaround: Player 2+ shuffles work correctly since cards already have non-infinity
// points after Player 1's shuffle. For Player 1, perform the first shuffle off-chain
// or use a different proof system.

use zkpoker_primitives::card::Card;
use zkpoker_primitives::elgamal::{add_player_and_mask, secret_to_public_key};
use std::embedded_curve_ops::{EmbeddedCurvePoint, EmbeddedCurveScalar};
use std::hash::pedersen_hash;

// Main circuit entry point
// Note: Array sizes are hardcoded to 52 cards as Noir doesn't allow globals in array dimensions
fn main(
    // === Public inputs ===
    // Commitment to deck before shuffle
    deck_commitment_before: pub Field,
    // Commitment to deck after shuffle
    deck_commitment_after: pub Field,
    // Player's public key who performed the shuffle
    player_pub_x: pub Field,
    player_pub_y: pub Field,

    // === Private inputs ===
    // Cards before shuffle (just msg.x and msg.y since they start unmasked)
    cards_before: [Field; 104], // 52 cards * 2 coords

    // Cards after shuffle (full card data: epk.x, epk.y, msg.x, msg.y, pk.x, pk.y)
    cards_after: [Field; 312], // 52 cards * 6 fields

    // Permutation: position i contains the original index of card now at position i
    permutation: [u32; 52],

    // Player's secret key
    player_secret_lo: Field,
    player_secret_hi: Field,

    // Nonces used for masking each card
    nonces_lo: [Field; 52],
    nonces_hi: [Field; 52],
) {
    let player_secret = EmbeddedCurveScalar::new(player_secret_lo, player_secret_hi);

    // Verify player's public key matches secret
    let computed_pub = secret_to_public_key(player_secret);
    assert(computed_pub.x == player_pub_x, "Player public key x mismatch");
    assert(computed_pub.y == player_pub_y, "Player public key y mismatch");

    // Verify permutation is valid (each index appears exactly once)
    let mut seen: [bool; 52] = [false; 52];
    for i in 0..52 {
        let idx = permutation[i];
        assert(idx < 52, "Permutation index out of range");
        assert(!seen[idx], "Duplicate in permutation");
        seen[idx] = true;
    }

    // Compute deck commitment before (product of card hashes)
    let mut commitment_before: Field = 1;
    for i in 0..52 {
        // Unmasked card: epk=(0,0), pk=(0,0), msg=(x,y)
        let card_hash = pedersen_hash([
            0, 0,  // epk
            cards_before[i * 2], cards_before[i * 2 + 1],  // msg
            0, 0   // pk
        ]);
        commitment_before = commitment_before * (card_hash + 1);
    }
    assert(commitment_before == deck_commitment_before, "Before commitment mismatch");

    // Verify each card was correctly shuffled and masked
    let mut commitment_after: Field = 1;
    for i in 0..52 {
        // Get the original card index from permutation
        let orig_idx = permutation[i];

        // Reconstruct original unmasked card
        let orig_card = Card {
            epk: EmbeddedCurvePoint { x: 0, y: 0, is_infinite: true },
            msg: EmbeddedCurvePoint {
                x: cards_before[orig_idx * 2],
                y: cards_before[orig_idx * 2 + 1],
                is_infinite: false
            },
            pk: EmbeddedCurvePoint { x: 0, y: 0, is_infinite: true },
        };

        // Apply masking with player's secret and nonce
        let nonce = EmbeddedCurveScalar::new(nonces_lo[i], nonces_hi[i]);
        let expected_masked = add_player_and_mask(orig_card, player_secret, nonce);

        // Get actual masked card from output
        let base = i * 6;
        let actual_epk_x = cards_after[base];
        let actual_epk_y = cards_after[base + 1];
        let actual_msg_x = cards_after[base + 2];
        let actual_msg_y = cards_after[base + 3];
        let actual_pk_x = cards_after[base + 4];
        let actual_pk_y = cards_after[base + 5];

        // Verify masking was done correctly
        assert(expected_masked.epk.x == actual_epk_x, "EPK x mismatch");
        assert(expected_masked.epk.y == actual_epk_y, "EPK y mismatch");
        assert(expected_masked.msg.x == actual_msg_x, "MSG x mismatch");
        assert(expected_masked.msg.y == actual_msg_y, "MSG y mismatch");
        assert(expected_masked.pk.x == actual_pk_x, "PK x mismatch");
        assert(expected_masked.pk.y == actual_pk_y, "PK y mismatch");

        // Add to after commitment
        let card_hash = pedersen_hash([
            actual_epk_x, actual_epk_y,
            actual_msg_x, actual_msg_y,
            actual_pk_x, actual_pk_y
        ]);
        commitment_after = commitment_after * (card_hash + 1);
    }

    assert(commitment_after == deck_commitment_after, "After commitment mismatch");
}
