// Helper to compute values for circuit_mask with non-infinity input points
// This simulates Player 2 masking a card that Player 1 already masked

use zkpoker_primitives::card::Card;
use zkpoker_primitives::elgamal::{add_player_and_mask, secret_to_public_key};
use std::embedded_curve_ops::{EmbeddedCurvePoint, EmbeddedCurveScalar, fixed_base_scalar_mul};
use std::hash::pedersen_hash;

fn main() -> pub [Field; 20] {
    // Create an unmasked card (scalar 100)
    let card_point = fixed_base_scalar_mul(EmbeddedCurveScalar::new(100, 0));
    let card = Card::new(card_point);

    // Player 1 masks first
    let p1_secret = EmbeddedCurveScalar::new(11111, 0);
    let p1_nonce = EmbeddedCurveScalar::new(22222, 0);
    let masked1 = add_player_and_mask(card, p1_secret, p1_nonce);

    // Player 2's credentials
    let p2_secret = EmbeddedCurveScalar::new(33333, 0);
    let p2_nonce = EmbeddedCurveScalar::new(44444, 0);

    // Compute Player 2's public key
    let p2_pub = secret_to_public_key(p2_secret);

    // Compute input card commitment (Player 1's masked card)
    let input_commitment = pedersen_hash([
        masked1.epk.x, masked1.epk.y,
        masked1.msg.x, masked1.msg.y,
        masked1.pk.x, masked1.pk.y
    ]);

    // Apply Player 2's masking
    let masked2 = add_player_and_mask(masked1, p2_secret, p2_nonce);

    // Compute output card commitment
    let output_commitment = pedersen_hash([
        masked2.epk.x, masked2.epk.y,
        masked2.msg.x, masked2.msg.y,
        masked2.pk.x, masked2.pk.y
    ]);

    // Return all values needed for Prover.toml:
    // Public inputs
    [
        input_commitment,       // [0]
        output_commitment,      // [1]
        p2_pub.x,              // [2]
        p2_pub.y,              // [3]
        // Private inputs - Input card (Player 1's masked card)
        masked1.epk.x,         // [4]
        masked1.epk.y,         // [5]
        0,                     // [6] epk is_inf = false
        masked1.msg.x,         // [7]
        masked1.msg.y,         // [8]
        masked1.pk.x,          // [9]
        masked1.pk.y,          // [10]
        0,                     // [11] pk is_inf = false
        33333,                 // [12] p2_secret_lo
        0,                     // [13] p2_secret_hi
        44444,                 // [14] p2_nonce_lo
        0,                     // [15] p2_nonce_hi
        // Additional info
        masked2.epk.x,         // [16] output epk.x
        masked2.epk.y,         // [17] output epk.y
        masked2.msg.x,         // [18] output msg.x
        masked2.msg.y          // [19] output msg.y
    ]
}
