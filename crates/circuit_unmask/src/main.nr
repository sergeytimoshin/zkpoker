// Card Unmasking Circuit
// Proves that a card was correctly partially unmasked by a player
//
// This circuit verifies:
// 1. The player's public key matches their secret
// 2. The unmasking operation was performed correctly
// 3. The output card commitment matches the expected value

use zkpoker_primitives::card::Card;
use zkpoker_primitives::elgamal::secret_to_public_key;
use std::embedded_curve_ops::{EmbeddedCurvePoint, EmbeddedCurveScalar, multi_scalar_mul};
use std::hash::pedersen_hash;

// Main circuit entry point
fn main(
    // === Public inputs ===
    // Commitment to the input card (before unmasking)
    input_card_commitment: pub Field,
    // Commitment to the output card (after unmasking)
    output_card_commitment: pub Field,
    // Player's public key (x coordinate)
    player_pub_x: pub Field,
    // Player's public key (y coordinate)
    player_pub_y: pub Field,

    // === Private inputs ===
    // Input card components
    input_epk_x: Field,
    input_epk_y: Field,
    input_msg_x: Field,
    input_msg_y: Field,
    input_pk_x: Field,
    input_pk_y: Field,

    // Player's secret key (lo limb)
    player_secret_lo: Field,
    // Player's secret key (hi limb)
    player_secret_hi: Field,
) {
    // Reconstruct the input card
    let input_epk = EmbeddedCurvePoint { x: input_epk_x, y: input_epk_y, is_infinite: false };
    let input_msg = EmbeddedCurvePoint { x: input_msg_x, y: input_msg_y, is_infinite: false };
    let input_pk = EmbeddedCurvePoint { x: input_pk_x, y: input_pk_y, is_infinite: false };

    // Verify input card commitment
    let computed_input_commitment = pedersen_hash([
        input_epk_x, input_epk_y,
        input_msg_x, input_msg_y,
        input_pk_x, input_pk_y
    ]);
    assert(computed_input_commitment == input_card_commitment, "Input card commitment mismatch");

    // Reconstruct player secret
    let player_secret = EmbeddedCurveScalar::new(player_secret_lo, player_secret_hi);

    // Verify player's public key matches their secret
    let computed_pub = secret_to_public_key(player_secret);
    assert(computed_pub.x == player_pub_x, "Player public key x mismatch");
    assert(computed_pub.y == player_pub_y, "Player public key y mismatch");

    // ============================================================
    // Apply partial unmasking operation (inlined with P-P=O fix)
    // ============================================================

    // Step 1: Compute decryption_share = epk * player_secret
    let decryption_share = multi_scalar_mul([input_epk], [player_secret]);

    // Step 2: Compute new_msg = msg - decryption_share
    // Check if msg == decryption_share (P - P = O case)
    let msg_eq_ds = (input_msg.x == decryption_share.x) & (input_msg.y == decryption_share.y);
    let new_msg = if msg_eq_ds {
        EmbeddedCurvePoint { x: 0, y: 0, is_infinite: true }
    } else {
        input_msg - decryption_share
    };

    // Step 3: Compute new_pk = pk - player_pub
    // Check if pk == player_pub (P - P = O case)
    let pk_eq_pub = (input_pk.x == computed_pub.x) & (input_pk.y == computed_pub.y);
    let new_pk = if pk_eq_pub {
        // P - P = O (identity/infinity)
        EmbeddedCurvePoint { x: 0, y: 0, is_infinite: true }
    } else {
        input_pk - computed_pub
    };

    // ============================================================
    // Verify output card commitment
    // ============================================================

    // Use (0,0) for infinity points in commitment hash
    let out_epk_x = if input_epk.is_infinite { 0 } else { input_epk.x };
    let out_epk_y = if input_epk.is_infinite { 0 } else { input_epk.y };
    let out_msg_x = if new_msg.is_infinite { 0 } else { new_msg.x };
    let out_msg_y = if new_msg.is_infinite { 0 } else { new_msg.y };
    let out_pk_x = if new_pk.is_infinite { 0 } else { new_pk.x };
    let out_pk_y = if new_pk.is_infinite { 0 } else { new_pk.y };

    let computed_output_commitment = pedersen_hash([
        out_epk_x, out_epk_y,
        out_msg_x, out_msg_y,
        out_pk_x, out_pk_y
    ]);
    assert(computed_output_commitment == output_card_commitment, "Output card commitment mismatch");
}
