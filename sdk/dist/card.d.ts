/**
 * Card representation for ZK Poker
 *
 * Cards are represented as ElGamal-encrypted curve points.
 * Each card has:
 * - epk: Ephemeral public key from masking operations
 * - msg: Card value as a curve point (masked or unmasked)
 * - pk: Joint public key of all players involved in masking
 */
import { Point } from "./grumpkin.js";
export declare const DECK_SIZE = 52;
export declare const CARD_PRIMES: bigint[];
export declare const RANK_PRIMES: bigint[];
export declare const SUITS: readonly ["Hearts", "Diamonds", "Clubs", "Spades"];
export declare const RANKS: readonly ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
/**
 * Card struct representing an ElGamal-encrypted card
 */
export interface Card {
    epk: Point;
    msg: Point;
    pk: Point;
}
/**
 * Create a new unmasked card from a card point
 */
export declare function createCardFromPoint(cardPoint: Point): Card;
/**
 * Convert a card index (0-51) to its corresponding curve point
 * Uses hash-to-curve: hash the card prime to get a scalar, then G * scalar
 */
export declare function cardIndexToPoint(cardIndex: number): Point;
/**
 * Create a new unmasked card from a card index
 */
export declare function createCard(cardIndex: number): Card;
/**
 * Check if card is fully unmasked (no masking keys remaining)
 */
export declare function isUnmasked(card: Card): boolean;
/**
 * Check if card has players who can unmask it
 */
export declare function hasPlayers(card: Card): boolean;
/**
 * Check if card has ephemeral key applied
 */
export declare function hasEpk(card: Card): boolean;
/**
 * Compute a hash commitment of this card
 */
export declare function cardCommitment(card: Card): bigint;
/**
 * Get card prime for a given card index
 */
export declare function getCardPrime(cardIndex: number): bigint;
/**
 * Get rank prime (suit-independent) for a card index
 */
export declare function getRankPrime(cardIndex: number): bigint;
/**
 * Get suit of a card (0=Hearts, 1=Diamonds, 2=Clubs, 3=Spades)
 */
export declare function getSuit(cardIndex: number): number;
/**
 * Get rank of a card (0=2, 1=3, ..., 12=A)
 */
export declare function getRank(cardIndex: number): number;
/**
 * Get human-readable card name
 */
export declare function getCardName(cardIndex: number): string;
/**
 * Create a full deck of 52 unmasked cards
 */
export declare function createDeck(): Card[];
//# sourceMappingURL=card.d.ts.map