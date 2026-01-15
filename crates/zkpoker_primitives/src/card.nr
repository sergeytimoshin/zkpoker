// Card data structure for mental poker
// Represents a masked or unmasked playing card using ElGamal encryption

use std::embedded_curve_ops::{
    EmbeddedCurvePoint,
    EmbeddedCurveScalar,
    fixed_base_scalar_mul
};
use std::hash::pedersen_hash;

use crate::constants::{CARD_PRIMES, DECK_SIZE};

// Card struct representing an ElGamal-encrypted card
// Based on the mental poker protocol from prove-my-turn and poZKer
pub struct Card {
    // Joint ephemeral public key from all masking operations
    // For new (unmasked) cards, this is the point at infinity
    pub epk: EmbeddedCurvePoint,

    // Card value as a curve point (masked or unmasked)
    // When unmasked, this represents the original card point
    // When masked, this is encrypted with ElGamal
    pub msg: EmbeddedCurvePoint,

    // Joint public key of all players involved in masking
    // When this equals the point at infinity, the card is fully unmasked
    pub pk: EmbeddedCurvePoint,
}

impl Card {
    // Create a new unmasked card from a card point
    pub fn new(card_point: EmbeddedCurvePoint) -> Self {
        Card {
            epk: EmbeddedCurvePoint::point_at_infinity(),
            msg: card_point,
            pk: EmbeddedCurvePoint::point_at_infinity(),
        }
    }

    // Check if card is fully unmasked (no masking keys remaining)
    pub fn is_unmasked(self) -> bool {
        self.pk.is_infinite
    }

    // Check if card has players who can unmask it
    pub fn has_players(self) -> bool {
        !self.pk.is_infinite
    }

    // Check if card has ephemeral key applied
    pub fn has_epk(self) -> bool {
        !self.epk.is_infinite
    }

    // Compute a hash commitment of this card
    pub fn commitment(self) -> Field {
        pedersen_hash([self.epk.x, self.epk.y, self.msg.x, self.msg.y, self.pk.x, self.pk.y])
    }
}

// Convert a card index (0-51) to its corresponding curve point
// Uses hash-to-curve: hash the card prime to get a scalar, then G * scalar
pub fn card_index_to_point(card_index: u32) -> EmbeddedCurvePoint {
    assert(card_index < DECK_SIZE, "Card index out of range");

    // Hash the card prime to get a deterministic scalar
    let card_prime = CARD_PRIMES[card_index];
    let scalar_field = pedersen_hash([card_prime]);

    // Convert field to scalar (using lo limb only since hash output fits)
    let scalar = EmbeddedCurveScalar::from_field(scalar_field);

    // Compute G * scalar
    fixed_base_scalar_mul(scalar)
}

// Create a new unmasked card from a card index
pub fn create_card(card_index: u32) -> Card {
    let card_point = card_index_to_point(card_index);
    Card::new(card_point)
}

// Compare two card points for equality
pub fn points_equal(p1: EmbeddedCurvePoint, p2: EmbeddedCurvePoint) -> bool {
    if p1.is_infinite & p2.is_infinite {
        true
    } else if p1.is_infinite | p2.is_infinite {
        false
    } else {
        (p1.x == p2.x) & (p1.y == p2.y)
    }
}
