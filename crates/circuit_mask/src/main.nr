// Card Masking Circuit
// Proves that a card was correctly masked by a player using ElGamal encryption
//
// This circuit verifies:
// 1. The player's public key matches their secret
// 2. The masking operations were performed correctly
// 3. The output card commitment matches the expected value
//
// IMPORTANT: Sunspot/gnark limitation
// When using sunspot for proof generation, input points at infinity (is_infinite=true)
// will cause proof generation to fail due to a mismatch between gnark's GLV hint system
// and Noir's pre-computed witness values.
//
// Workaround: This circuit works correctly when input_epk and input_pk are NOT at infinity.
// In a multi-player poker game, Player 1's first masking operation has infinity points,
// but Player 2+ will have non-infinity inputs after Player 1's masking.
//
// Options for Player 1:
// - Perform first masking off-chain (trusted setup) with a dealer
// - Use a different proof system that handles infinity points correctly

use zkpoker_primitives::card::Card;
use zkpoker_primitives::elgamal::{add_player_and_mask, secret_to_public_key};
use std::embedded_curve_ops::{EmbeddedCurvePoint, EmbeddedCurveScalar};
use std::hash::pedersen_hash;

// Main circuit entry point
// Public inputs define what the verifier can see
// Private inputs are hidden from the verifier (zero-knowledge)
fn main(
    // === Public inputs ===
    // Commitment to the input card (before masking)
    input_card_commitment: pub Field,
    // Commitment to the output card (after masking)
    output_card_commitment: pub Field,
    // Player's public key (x coordinate)
    player_pub_x: pub Field,
    // Player's public key (y coordinate)
    player_pub_y: pub Field,

    // === Private inputs ===
    // Input card components
    input_epk_x: Field,
    input_epk_y: Field,
    input_epk_is_inf: bool,
    input_msg_x: Field,
    input_msg_y: Field,
    input_pk_x: Field,
    input_pk_y: Field,
    input_pk_is_inf: bool,

    // Player's secret key (lo limb)
    player_secret_lo: Field,
    // Player's secret key (hi limb)
    player_secret_hi: Field,

    // Masking nonce (lo limb)
    nonce_lo: Field,
    // Masking nonce (hi limb)
    nonce_hi: Field,
) {
    // Reconstruct the input card
    let input_card = Card {
        epk: EmbeddedCurvePoint { x: input_epk_x, y: input_epk_y, is_infinite: input_epk_is_inf },
        msg: EmbeddedCurvePoint { x: input_msg_x, y: input_msg_y, is_infinite: false },
        pk: EmbeddedCurvePoint { x: input_pk_x, y: input_pk_y, is_infinite: input_pk_is_inf },
    };

    // Verify input card commitment
    let computed_input_commitment = pedersen_hash([
        input_epk_x, input_epk_y,
        input_msg_x, input_msg_y,
        input_pk_x, input_pk_y
    ]);
    assert(computed_input_commitment == input_card_commitment, "Input card commitment mismatch");

    // Reconstruct player secret and nonce
    let player_secret = EmbeddedCurveScalar::new(player_secret_lo, player_secret_hi);
    let nonce = EmbeddedCurveScalar::new(nonce_lo, nonce_hi);

    // Verify player's public key matches their secret
    let computed_pub = secret_to_public_key(player_secret);
    assert(computed_pub.x == player_pub_x, "Player public key x mismatch");
    assert(computed_pub.y == player_pub_y, "Player public key y mismatch");

    // Apply masking operations
    let output_card = add_player_and_mask(input_card, player_secret, nonce);

    // Verify output card commitment
    let computed_output_commitment = pedersen_hash([
        output_card.epk.x, output_card.epk.y,
        output_card.msg.x, output_card.msg.y,
        output_card.pk.x, output_card.pk.y
    ]);
    assert(computed_output_commitment == output_card_commitment, "Output card commitment mismatch");
}
