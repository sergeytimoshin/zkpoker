/**
 * Card representation for ZK Poker
 *
 * Cards are represented as ElGamal-encrypted curve points.
 * Each card has:
 * - epk: Ephemeral public key from masking operations
 * - msg: Card value as a curve point (masked or unmasked)
 * - pk: Joint public key of all players involved in masking
 */
import { pointAtInfinity, fixedBaseScalarMul, scalarFromBigint, } from "./grumpkin.js";
import { pedersenHash } from "./pedersen.js";
// Standard deck size (no jokers for Texas Hold'em)
export const DECK_SIZE = 52;
// Prime-based card encoding
// Cards are ordered by suit (Hearts, Diamonds, Clubs, Spades) then rank (2-A)
export const CARD_PRIMES = [
    // Hearts (2h-Ah): indices 0-12
    2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n,
    // Diamonds (2d-Ad): indices 13-25
    43n, 47n, 53n, 59n, 61n, 67n, 71n, 73n, 79n, 83n, 89n, 97n, 101n,
    // Clubs (2c-Ac): indices 26-38
    103n, 107n, 109n, 113n, 127n, 131n, 137n, 139n, 149n, 151n, 157n, 163n, 167n,
    // Spades (2s-As): indices 39-51
    173n, 179n, 181n, 191n, 193n, 197n, 199n, 211n, 223n, 227n, 229n, 233n, 239n,
];
// Rank primes (suit-independent) for hand evaluation
export const RANK_PRIMES = [
    2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n,
];
// Suit names
export const SUITS = ["Hearts", "Diamonds", "Clubs", "Spades"];
// Rank names
export const RANKS = [
    "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A",
];
/**
 * Create a new unmasked card from a card point
 */
export function createCardFromPoint(cardPoint) {
    return {
        epk: pointAtInfinity(),
        msg: cardPoint,
        pk: pointAtInfinity(),
    };
}
/**
 * Convert a card index (0-51) to its corresponding curve point
 * Uses hash-to-curve: hash the card prime to get a scalar, then G * scalar
 */
export function cardIndexToPoint(cardIndex) {
    if (cardIndex < 0 || cardIndex >= DECK_SIZE) {
        throw new Error(`Card index out of range: ${cardIndex}`);
    }
    const cardPrime = CARD_PRIMES[cardIndex];
    const scalarField = pedersenHash([cardPrime]);
    const scalar = scalarFromBigint(scalarField);
    return fixedBaseScalarMul(scalar);
}
/**
 * Create a new unmasked card from a card index
 */
export function createCard(cardIndex) {
    const cardPoint = cardIndexToPoint(cardIndex);
    return createCardFromPoint(cardPoint);
}
/**
 * Check if card is fully unmasked (no masking keys remaining)
 */
export function isUnmasked(card) {
    return card.pk.isInfinity;
}
/**
 * Check if card has players who can unmask it
 */
export function hasPlayers(card) {
    return !card.pk.isInfinity;
}
/**
 * Check if card has ephemeral key applied
 */
export function hasEpk(card) {
    return !card.epk.isInfinity;
}
/**
 * Compute a hash commitment of this card
 */
export function cardCommitment(card) {
    // Use (0,0) for infinity points to match circuit behavior
    const epkX = card.epk.isInfinity ? 0n : card.epk.x;
    const epkY = card.epk.isInfinity ? 0n : card.epk.y;
    const msgX = card.msg.isInfinity ? 0n : card.msg.x;
    const msgY = card.msg.isInfinity ? 0n : card.msg.y;
    const pkX = card.pk.isInfinity ? 0n : card.pk.x;
    const pkY = card.pk.isInfinity ? 0n : card.pk.y;
    return pedersenHash([epkX, epkY, msgX, msgY, pkX, pkY]);
}
/**
 * Get card prime for a given card index
 */
export function getCardPrime(cardIndex) {
    if (cardIndex < 0 || cardIndex >= DECK_SIZE) {
        throw new Error(`Card index out of range: ${cardIndex}`);
    }
    return CARD_PRIMES[cardIndex];
}
/**
 * Get rank prime (suit-independent) for a card index
 */
export function getRankPrime(cardIndex) {
    if (cardIndex < 0 || cardIndex >= DECK_SIZE) {
        throw new Error(`Card index out of range: ${cardIndex}`);
    }
    const rank = cardIndex % 13;
    return RANK_PRIMES[rank];
}
/**
 * Get suit of a card (0=Hearts, 1=Diamonds, 2=Clubs, 3=Spades)
 */
export function getSuit(cardIndex) {
    if (cardIndex < 0 || cardIndex >= DECK_SIZE) {
        throw new Error(`Card index out of range: ${cardIndex}`);
    }
    return Math.floor(cardIndex / 13);
}
/**
 * Get rank of a card (0=2, 1=3, ..., 12=A)
 */
export function getRank(cardIndex) {
    if (cardIndex < 0 || cardIndex >= DECK_SIZE) {
        throw new Error(`Card index out of range: ${cardIndex}`);
    }
    return cardIndex % 13;
}
/**
 * Get human-readable card name
 */
export function getCardName(cardIndex) {
    const rank = getRank(cardIndex);
    const suit = getSuit(cardIndex);
    return `${RANKS[rank]} of ${SUITS[suit]}`;
}
/**
 * Create a full deck of 52 unmasked cards
 */
export function createDeck() {
    return Array.from({ length: DECK_SIZE }, (_, i) => createCard(i));
}
//# sourceMappingURL=card.js.map