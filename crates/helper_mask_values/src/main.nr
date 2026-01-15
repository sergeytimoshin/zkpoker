// Helper to compute values for circuit_mask Prover.toml
// Run with: nargo execute --package helper_mask_values
// The return values will be printed

use zkpoker_primitives::card::Card;
use zkpoker_primitives::elgamal::{add_player_and_mask, secret_to_public_key};
use std::embedded_curve_ops::{EmbeddedCurveScalar, fixed_base_scalar_mul};
use std::hash::pedersen_hash;

fn main() -> pub [Field; 14] {
    // Create an unmasked card (scalar 42)
    let card_point = fixed_base_scalar_mul(EmbeddedCurveScalar::new(42, 0));
    let card = Card::new(card_point);

    // Player secret and nonce
    let player_secret = EmbeddedCurveScalar::new(12345, 0);
    let nonce = EmbeddedCurveScalar::new(67890, 0);

    // Compute player public key
    let player_pub = secret_to_public_key(player_secret);

    // Compute input card commitment
    // For a new card: epk = (0,0), pk = (0,0)
    let input_commitment = pedersen_hash([0, 0, card_point.x, card_point.y, 0, 0]);

    // Apply masking
    let masked = add_player_and_mask(card, player_secret, nonce);

    // Compute output card commitment
    let output_commitment = pedersen_hash([
        masked.epk.x, masked.epk.y,
        masked.msg.x, masked.msg.y,
        masked.pk.x, masked.pk.y
    ]);

    // Return all values needed for Prover.toml:
    // [0] input_card_commitment
    // [1] output_card_commitment
    // [2] player_pub_x
    // [3] player_pub_y
    // [4] input_msg_x (card_point.x)
    // [5] input_msg_y (card_point.y)
    // [6] masked.epk.x
    // [7] masked.epk.y
    // [8] masked.msg.x
    // [9] masked.msg.y
    // [10] masked.pk.x
    // [11] masked.pk.y
    // [12-13] padding
    [
        input_commitment,
        output_commitment,
        player_pub.x,
        player_pub.y,
        card_point.x,
        card_point.y,
        masked.epk.x,
        masked.epk.y,
        masked.msg.x,
        masked.msg.y,
        masked.pk.x,
        masked.pk.y,
        0,
        0
    ]
}
