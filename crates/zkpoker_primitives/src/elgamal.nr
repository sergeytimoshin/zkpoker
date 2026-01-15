// ElGamal encryption operations for mental poker
// Implements the mask/unmask protocol for commutative encryption

use std::embedded_curve_ops::{
    EmbeddedCurvePoint,
    EmbeddedCurveScalar,
    multi_scalar_mul,
    fixed_base_scalar_mul
};

use crate::card::Card;

// Scalar multiplication: point * scalar
fn scalar_mul(point: EmbeddedCurvePoint, scalar: EmbeddedCurveScalar) -> EmbeddedCurvePoint {
    multi_scalar_mul([point], [scalar])
}

// Add a player to the card's masking group
// This must be called before masking can occur
// Mathematical operation:
//   pk_new = pk + G * player_secret
//   msg_new = msg + epk * player_secret (if epk exists)
//
// Parameters:
//   card: The card to add the player to
//   player_secret: The player's private key (scalar)
//
// Returns: A new Card with the player added to the masking group
pub fn add_player_to_card_mask(card: Card, player_secret: EmbeddedCurveScalar) -> Card {
    // Compute player's public key: G * player_secret
    let player_pub = fixed_base_scalar_mul(player_secret);

    // Check if this is the first player being added
    let is_first_player = card.pk.is_infinite;

    // New pk = old_pk + player_pub
    let new_pk = if is_first_player {
        player_pub
    } else {
        card.pk + player_pub
    };

    // If unmasked (no players yet), don't modify msg
    // If already has players, msg_new = msg + epk * player_secret
    let new_msg = if is_first_player | card.epk.is_infinite {
        // No epk yet, or first player - msg unchanged
        card.msg
    } else {
        // msg_new = msg + epk * player_secret
        let epk_scaled = scalar_mul(card.epk, player_secret);
        card.msg + epk_scaled
    };

    Card {
        epk: card.epk,
        msg: new_msg,
        pk: new_pk,
    }
}

// Mask a card with a random nonce (ElGamal encryption step)
// Mathematical operation:
//   epk_new = epk + G * nonce (or G * nonce if epk is identity)
//   msg_new = msg + pk * nonce
//
// Requirements: Card must have at least one player in pk
//
// Parameters:
//   card: The card to mask
//   nonce: Random scalar for encryption
//
// Returns: A new masked Card
pub fn mask(card: Card, nonce: EmbeddedCurveScalar) -> Card {
    // Assert card has players who can unmask
    assert(!card.pk.is_infinite, "Cannot mask card with no players");

    // Compute ephemeral public key from nonce: G * nonce
    let ephemeral_pub = fixed_base_scalar_mul(nonce);

    // New epk = old_epk + ephemeral_pub
    let new_epk = if card.epk.is_infinite {
        ephemeral_pub
    } else {
        card.epk + ephemeral_pub
    };

    // Apply mask to message: msg_new = msg + pk * nonce
    let shared_secret = scalar_mul(card.pk, nonce);
    let new_msg = card.msg + shared_secret;

    Card {
        epk: new_epk,
        msg: new_msg,
        pk: card.pk,
    }
}

// Partially unmask a card (one player reveals their share)
// Mathematical operation:
//   msg_new = msg - epk * player_secret
//   pk_new = pk - G * player_secret
//
// When all players have unmasked, pk becomes the point at infinity
// and msg contains the original card point
//
// Parameters:
//   card: The card to unmask
//   player_secret: The player's private key (scalar)
//
// Returns: A new Card with one layer of masking removed
//
// Note: Contains workaround for Noir bug where P-P fails when preceded by
// public input assertions. See: https://github.com/noir-lang/noir/issues/XXXX
pub fn partial_unmask(card: Card, player_secret: EmbeddedCurveScalar) -> Card {
    // Cannot unmask if already fully unmasked
    assert(!card.pk.is_infinite, "Card is already unmasked");
    assert(!card.epk.is_infinite, "Invalid epk for unmasking");

    // Compute the decryption share: d = epk * player_secret
    let decryption_share = scalar_mul(card.epk, player_secret);

    // New msg = msg - decryption_share
    // Workaround: If msg == decryption_share, result is infinity (avoid embedded_curve_add bug)
    let msg_eq_ds = (card.msg.x == decryption_share.x) & (card.msg.y == decryption_share.y);
    let new_msg = if msg_eq_ds {
        EmbeddedCurvePoint { x: 0, y: 0, is_infinite: true }
    } else {
        card.msg - decryption_share
    };

    // Remove player from pk: pk_new = pk - player_pub
    // Workaround: If pk == player_pub, result is infinity (avoid embedded_curve_add bug)
    let player_pub = fixed_base_scalar_mul(player_secret);
    let pk_eq_pub = (card.pk.x == player_pub.x) & (card.pk.y == player_pub.y);
    let new_pk = if pk_eq_pub {
        EmbeddedCurvePoint { x: 0, y: 0, is_infinite: true }
    } else {
        card.pk - player_pub
    };

    Card {
        epk: card.epk,
        msg: new_msg,
        pk: new_pk,
    }
}

// Combined operation: add player and mask in one step
// This is the typical flow during the shuffle phase
pub fn add_player_and_mask(
    card: Card,
    player_secret: EmbeddedCurveScalar,
    nonce: EmbeddedCurveScalar
) -> Card {
    let card_with_player = add_player_to_card_mask(card, player_secret);
    mask(card_with_player, nonce)
}

// Compute public key from secret
pub fn secret_to_public_key(secret: EmbeddedCurveScalar) -> EmbeddedCurvePoint {
    fixed_base_scalar_mul(secret)
}

// ============================================================
// Unit Tests
// ============================================================

#[test]
fn test_single_player_mask_unmask() {
    // Create a card (using a simple point for testing)
    let card_point = fixed_base_scalar_mul(EmbeddedCurveScalar::new(42, 0));
    let card = Card::new(card_point);

    // Player secret and nonce
    let player_secret = EmbeddedCurveScalar::new(12345, 0);
    let nonce = EmbeddedCurveScalar::new(67890, 0);

    // Mask the card
    let masked = add_player_and_mask(card, player_secret, nonce);

    // Verify the card is masked (pk should not be at infinity)
    assert(!masked.pk.is_infinite, "Card should be masked");

    // Unmask the card
    let unmasked = partial_unmask(masked, player_secret);

    // Verify the card is fully unmasked (pk should be at infinity)
    assert(unmasked.pk.is_infinite, "Card should be fully unmasked");

    // Verify the original card point is recovered
    assert(unmasked.msg.x == card_point.x, "Card msg.x should match original");
    assert(unmasked.msg.y == card_point.y, "Card msg.y should match original");
}

#[test]
fn test_two_player_mask_unmask() {
    // Create a card
    let card_point = fixed_base_scalar_mul(EmbeddedCurveScalar::new(100, 0));
    let card = Card::new(card_point);

    // Player 1 secrets
    let p1_secret = EmbeddedCurveScalar::new(11111, 0);
    let p1_nonce = EmbeddedCurveScalar::new(22222, 0);

    // Player 2 secrets
    let p2_secret = EmbeddedCurveScalar::new(33333, 0);
    let p2_nonce = EmbeddedCurveScalar::new(44444, 0);

    // Player 1 masks
    let masked1 = add_player_and_mask(card, p1_secret, p1_nonce);

    // Player 2 masks
    let masked2 = add_player_and_mask(masked1, p2_secret, p2_nonce);

    // Verify both players' keys are in the mask
    assert(!masked2.pk.is_infinite, "Card should be masked by 2 players");

    // Player 2 unmasks (reverse order)
    let unmasked1 = partial_unmask(masked2, p2_secret);
    assert(!unmasked1.pk.is_infinite, "Card should still have P1's mask");

    // Player 1 unmasks
    let unmasked2 = partial_unmask(unmasked1, p1_secret);
    assert(unmasked2.pk.is_infinite, "Card should be fully unmasked");

    // Verify original point recovered
    assert(unmasked2.msg.x == card_point.x, "Card msg.x should match original");
    assert(unmasked2.msg.y == card_point.y, "Card msg.y should match original");
}

#[test]
fn test_three_player_mask_unmask() {
    // Create a card
    let card_point = fixed_base_scalar_mul(EmbeddedCurveScalar::new(999, 0));
    let card = Card::new(card_point);

    // Player secrets
    let p1_secret = EmbeddedCurveScalar::new(1, 0);
    let p2_secret = EmbeddedCurveScalar::new(2, 0);
    let p3_secret = EmbeddedCurveScalar::new(3, 0);

    // Nonces
    let n1 = EmbeddedCurveScalar::new(100, 0);
    let n2 = EmbeddedCurveScalar::new(200, 0);
    let n3 = EmbeddedCurveScalar::new(300, 0);

    // All players mask in sequence
    let m1 = add_player_and_mask(card, p1_secret, n1);
    let m2 = add_player_and_mask(m1, p2_secret, n2);
    let m3 = add_player_and_mask(m2, p3_secret, n3);

    // All players unmask (can be in any order due to commutativity)
    let u1 = partial_unmask(m3, p1_secret);
    let u2 = partial_unmask(u1, p3_secret);
    let u3 = partial_unmask(u2, p2_secret);

    // Verify fully unmasked
    assert(u3.pk.is_infinite, "Card should be fully unmasked");
    assert(u3.msg.x == card_point.x, "Card msg.x should match original");
    assert(u3.msg.y == card_point.y, "Card msg.y should match original");
}

// Test that generates values for circuit_mask Prover.toml
#[test]
fn test_mask_circuit_values() {
    // Create an unmasked card (point at infinity for epk and pk)
    let card_point = fixed_base_scalar_mul(EmbeddedCurveScalar::new(42, 0));
    let card = Card::new(card_point);

    // Player secret and nonce
    let player_secret = EmbeddedCurveScalar::new(12345, 0);
    let nonce = EmbeddedCurveScalar::new(67890, 0);

    // Compute input card commitment
    // For a new card: epk = (0,0), pk = (0,0)
    let input_commitment = std::hash::pedersen_hash([0, 0, card_point.x, card_point.y, 0, 0]);

    // Apply masking
    let masked = add_player_and_mask(card, player_secret, nonce);

    // Compute output card commitment
    let output_commitment = std::hash::pedersen_hash([
        masked.epk.x, masked.epk.y,
        masked.msg.x, masked.msg.y,
        masked.pk.x, masked.pk.y
    ]);

    // Compute player public key
    let _player_pub = secret_to_public_key(player_secret);

    // The test passes if we get here - the circuit should accept these values
    assert(input_commitment != output_commitment, "Commitments should differ");
    assert(!masked.pk.is_infinite, "Masked card should have pk");
}

// Test that prints values for circuit_unmask Prover.toml
#[test]
fn test_print_unmask_values() {
    // Create an unmasked card (point at infinity for epk and pk)
    let card_point = fixed_base_scalar_mul(EmbeddedCurveScalar::new(42, 0));
    let card = Card::new(card_point);

    // Player secret and nonce (same as circuit_mask test)
    let player_secret = EmbeddedCurveScalar::new(12345, 0);
    let nonce = EmbeddedCurveScalar::new(67890, 0);

    // Apply masking (this gives us the input for unmask)
    let masked = add_player_and_mask(card, player_secret, nonce);

    // Verify the card is masked (pk should not be at infinity)
    assert(!masked.pk.is_infinite, "Card should be masked");

    // Get player public key (= masked.pk since single player)
    let player_pub = masked.pk;

    // Compute input card commitment (masked card)
    let input_commitment = std::hash::pedersen_hash([
        masked.epk.x, masked.epk.y,
        masked.msg.x, masked.msg.y,
        masked.pk.x, masked.pk.y
    ]);

    // Apply partial_unmask
    let unmasked = partial_unmask(masked, player_secret);

    // Verify the roundtrip worked
    assert(unmasked.pk.is_infinite, "Unmasked card should have pk at infinity");

    // Compute output card commitment (unmasked card - pk is at infinity)
    // Use (0,0) for infinity points since .x/.y are garbage
    let out_pk_x = if unmasked.pk.is_infinite { 0 } else { unmasked.pk.x };
    let out_pk_y = if unmasked.pk.is_infinite { 0 } else { unmasked.pk.y };
    let output_commitment = std::hash::pedersen_hash([
        unmasked.epk.x, unmasked.epk.y,
        unmasked.msg.x, unmasked.msg.y,
        out_pk_x, out_pk_y
    ]);

    // Extract fields for printing
    let pub_x = player_pub.x;
    let pub_y = player_pub.y;
    let epk_x = masked.epk.x;
    let epk_y = masked.epk.y;
    let msg_x = masked.msg.x;
    let msg_y = masked.msg.y;
    let pk_x = masked.pk.x;
    let pk_y = masked.pk.y;

    // Print all values needed for circuit_unmask Prover.toml
    println("=== circuit_unmask Prover.toml values ===");
    println(f"input_card_commitment = {input_commitment}");
    println(f"output_card_commitment = {output_commitment}");
    println(f"player_pub_x = {pub_x}");
    println(f"player_pub_y = {pub_y}");
    println(f"input_epk_x = {epk_x}");
    println(f"input_epk_y = {epk_y}");
    println(f"input_msg_x = {msg_x}");
    println(f"input_msg_y = {msg_y}");
    println(f"input_pk_x = {pk_x}");
    println(f"input_pk_y = {pk_y}");
    println("player_secret_lo = 12345");
    println("player_secret_hi = 0");
    println("=== End values ===");

    assert(input_commitment != output_commitment, "Commitments should differ");
}

// Test that verifies secret_to_public_key gives the same result
#[test]
fn test_secret_to_public_key() {
    let player_secret = EmbeddedCurveScalar::new(12345, 0);
    let player_pub = secret_to_public_key(player_secret);

    let pub_x = player_pub.x;
    let pub_y = player_pub.y;

    println(f"secret_to_public_key(12345):");
    println(f"  x = {pub_x}");
    println(f"  y = {pub_y}");

    // Compare with add_player_to_card_mask result
    let card_point = fixed_base_scalar_mul(EmbeddedCurveScalar::new(42, 0));
    let card = Card::new(card_point);
    let masked = add_player_to_card_mask(card, player_secret);

    let mask_pub_x = masked.pk.x;
    let mask_pub_y = masked.pk.y;

    println(f"add_player_to_card_mask pk:");
    println(f"  x = {mask_pub_x}");
    println(f"  y = {mask_pub_y}");

    // They should be the same
    assert(pub_x == mask_pub_x, "X coordinates should match");
    assert(pub_y == mask_pub_y, "Y coordinates should match");
}

// Test with secret 99999 to generate alternative test values
#[test]
fn test_print_values_secret_99999() {
    // Create an unmasked card
    let card_point = fixed_base_scalar_mul(EmbeddedCurveScalar::new(42, 0));
    let card = Card::new(card_point);

    // Use different secret
    let player_secret = EmbeddedCurveScalar::new(99999, 0);
    let nonce = EmbeddedCurveScalar::new(88888, 0);

    // Apply masking
    let masked = add_player_and_mask(card, player_secret, nonce);
    let player_pub = masked.pk;

    // Compute input commitment
    let input_commitment = std::hash::pedersen_hash([
        masked.epk.x, masked.epk.y,
        masked.msg.x, masked.msg.y,
        masked.pk.x, masked.pk.y
    ]);

    // Apply unmasking
    let unmasked = partial_unmask(masked, player_secret);
    assert(unmasked.pk.is_infinite, "Should be at infinity");

    // Compute output commitment
    let out_pk_x = if unmasked.pk.is_infinite { 0 } else { unmasked.pk.x };
    let out_pk_y = if unmasked.pk.is_infinite { 0 } else { unmasked.pk.y };
    let output_commitment = std::hash::pedersen_hash([
        unmasked.epk.x, unmasked.epk.y,
        unmasked.msg.x, unmasked.msg.y,
        out_pk_x, out_pk_y
    ]);

    // Print values
    let pub_x = player_pub.x;
    let pub_y = player_pub.y;
    let epk_x = masked.epk.x;
    let epk_y = masked.epk.y;
    let msg_x = masked.msg.x;
    let msg_y = masked.msg.y;
    let pk_x = masked.pk.x;
    let pk_y = masked.pk.y;

    println("=== circuit_unmask Prover.toml (secret 99999) ===");
    println(f"input_card_commitment = {input_commitment}");
    println(f"output_card_commitment = {output_commitment}");
    println(f"player_pub_x = {pub_x}");
    println(f"player_pub_y = {pub_y}");
    println(f"input_epk_x = {epk_x}");
    println(f"input_epk_y = {epk_y}");
    println(f"input_msg_x = {msg_x}");
    println(f"input_msg_y = {msg_y}");
    println(f"input_pk_x = {pk_x}");
    println(f"input_pk_y = {pk_y}");
    println("player_secret_lo = 99999");
    println("player_secret_hi = 0");
    println("=== End ===");
}

// Test that generates shuffle circuit test data for 5 cards
#[test]
fn test_shuffle_circuit_data_5_cards() {
    // Create 5 unmasked cards (card points for cards 0-4)
    let card_scalars: [Field; 5] = [1, 2, 3, 4, 5];
    let mut cards_before: [Card; 5] = [Card::new(EmbeddedCurvePoint { x: 0, y: 0, is_infinite: true }); 5];

    for i in 0..5 {
        let card_point = fixed_base_scalar_mul(EmbeddedCurveScalar::new(card_scalars[i], 0));
        cards_before[i] = Card::new(card_point);
    }

    // Player secret and nonces
    let player_secret = EmbeddedCurveScalar::new(12345, 0);
    let nonces: [Field; 5] = [100, 200, 300, 400, 500];

    // Permutation: [2, 4, 0, 1, 3] means position 0 gets card 2, position 1 gets card 4, etc.
    let permutation: [u32; 5] = [2, 4, 0, 1, 3];

    // Compute deck commitment before
    let mut commitment_before: Field = 1;
    println("=== cards_before (msg.x, msg.y) ===");
    for i in 0..5 {
        let msg_x = cards_before[i].msg.x;
        let msg_y = cards_before[i].msg.y;
        println(f"  \"{msg_x}\",");
        println(f"  \"{msg_y}\",");

        let card_hash = std::hash::pedersen_hash([0, 0, msg_x, msg_y, 0, 0]);
        commitment_before = commitment_before * (card_hash + 1);
    }
    println(f"deck_commitment_before = \"{commitment_before}\"");

    // Apply shuffle and mask
    let mut cards_after: [Card; 5] = [Card::new(EmbeddedCurvePoint { x: 0, y: 0, is_infinite: true }); 5];
    let mut commitment_after: Field = 1;

    println("=== cards_after (epk.x, epk.y, msg.x, msg.y, pk.x, pk.y) ===");
    for i in 0..5 {
        let orig_idx = permutation[i];
        let nonce = EmbeddedCurveScalar::new(nonces[i], 0);
        let masked = add_player_and_mask(cards_before[orig_idx], player_secret, nonce);
        cards_after[i] = masked;

        let epk_x = masked.epk.x;
        let epk_y = masked.epk.y;
        let msg_x = masked.msg.x;
        let msg_y = masked.msg.y;
        let pk_x = masked.pk.x;
        let pk_y = masked.pk.y;

        println(f"  \"{epk_x}\",");
        println(f"  \"{epk_y}\",");
        println(f"  \"{msg_x}\",");
        println(f"  \"{msg_y}\",");
        println(f"  \"{pk_x}\",");
        println(f"  \"{pk_y}\",");

        let card_hash = std::hash::pedersen_hash([epk_x, epk_y, msg_x, msg_y, pk_x, pk_y]);
        commitment_after = commitment_after * (card_hash + 1);
    }
    println(f"deck_commitment_after = \"{commitment_after}\"");

    // Player public key
    let player_pub = secret_to_public_key(player_secret);
    let pub_x = player_pub.x;
    let pub_y = player_pub.y;
    println(f"player_pub_x = \"{pub_x}\"");
    println(f"player_pub_y = \"{pub_y}\"");
}

// Test that generates shuffle circuit test data for 52 cards
#[test]
fn test_shuffle_circuit_data_52_cards() {
    // Create 52 unmasked cards (card points for cards 1-52)
    // Using prime-based card encoding: card i -> G * prime[i]
    let card_primes: [Field; 52] = [
        2, 3, 5, 7, 11, 13, 17, 19, 23, 29,
        31, 37, 41, 43, 47, 53, 59, 61, 67, 71,
        73, 79, 83, 89, 97, 101, 103, 107, 109, 113,
        127, 131, 137, 139, 149, 151, 157, 163, 167, 173,
        179, 181, 191, 193, 197, 199, 211, 223, 227, 229,
        233, 239
    ];

    let mut cards_before: [Card; 52] = [Card::new(EmbeddedCurvePoint { x: 0, y: 0, is_infinite: true }); 52];
    for i in 0..52 {
        let card_point = fixed_base_scalar_mul(EmbeddedCurveScalar::new(card_primes[i], 0));
        cards_before[i] = Card::new(card_point);
    }

    // Player secret
    let player_secret = EmbeddedCurveScalar::new(12345, 0);

    // Simple permutation: reverse order (51, 50, ..., 1, 0)
    let mut permutation: [u32; 52] = [0; 52];
    for i in 0..52 {
        permutation[i] = (51 - i) as u32;
    }

    // Nonces: 1000 + i for each position
    let mut nonces: [Field; 52] = [0; 52];
    for i in 0..52 {
        nonces[i] = 1000 + i as Field;
    }

    // Compute deck commitment before
    let mut commitment_before: Field = 1;
    println("cards_before = [");
    for i in 0..52 {
        let msg_x = cards_before[i].msg.x;
        let msg_y = cards_before[i].msg.y;
        println(f"  \"{msg_x}\",");
        println(f"  \"{msg_y}\",");

        let card_hash = std::hash::pedersen_hash([0, 0, msg_x, msg_y, 0, 0]);
        commitment_before = commitment_before * (card_hash + 1);
    }
    println("]");
    println(f"deck_commitment_before = \"{commitment_before}\"");

    // Apply shuffle and mask
    let mut commitment_after: Field = 1;
    println("cards_after = [");
    for i in 0..52 {
        let orig_idx = permutation[i];
        let nonce = EmbeddedCurveScalar::new(nonces[i], 0);
        let masked = add_player_and_mask(cards_before[orig_idx], player_secret, nonce);

        let epk_x = masked.epk.x;
        let epk_y = masked.epk.y;
        let msg_x = masked.msg.x;
        let msg_y = masked.msg.y;
        let pk_x = masked.pk.x;
        let pk_y = masked.pk.y;

        println(f"  \"{epk_x}\", \"{epk_y}\", \"{msg_x}\", \"{msg_y}\", \"{pk_x}\", \"{pk_y}\",");

        let card_hash = std::hash::pedersen_hash([epk_x, epk_y, msg_x, msg_y, pk_x, pk_y]);
        commitment_after = commitment_after * (card_hash + 1);
    }
    println("]");
    println(f"deck_commitment_after = \"{commitment_after}\"");

    // Print permutation
    println("permutation = [51, 50, 49, 48, 47, 46, 45, 44, 43, 42, 41, 40, 39, 38, 37, 36, 35, 34, 33, 32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]");

    // Print nonces
    println("nonces_lo = [1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 1011, 1012, 1013, 1014, 1015, 1016, 1017, 1018, 1019, 1020, 1021, 1022, 1023, 1024, 1025, 1026, 1027, 1028, 1029, 1030, 1031, 1032, 1033, 1034, 1035, 1036, 1037, 1038, 1039, 1040, 1041, 1042, 1043, 1044, 1045, 1046, 1047, 1048, 1049, 1050, 1051]");
    println("nonces_hi = [\"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\", \"0\"]");

    // Player public key
    let player_pub = secret_to_public_key(player_secret);
    let pub_x = player_pub.x;
    let pub_y = player_pub.y;
    println(f"player_pub_x = \"{pub_x}\"");
    println(f"player_pub_y = \"{pub_y}\"");
    println("player_secret_lo = \"12345\"");
    println("player_secret_hi = \"0\"");
}
