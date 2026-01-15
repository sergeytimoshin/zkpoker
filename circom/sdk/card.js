// Card encoding and deck creation for ZK Poker
// Cards are encoded as points on BabyJubJub curve

import { scalarMul, BASE8, init } from './babyjub.js';
import { createCard } from './elgamal.js';

// Card index: 0-51
// rank = index % 13 (0=2, 1=3, ..., 12=A)
// suit = floor(index / 13) (0=clubs, 1=diamonds, 2=hearts, 3=spades)

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
export const SUITS = ['c', 'd', 'h', 's'];

// Rank primes for hand evaluation lookup
export const RANK_PRIMES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n];

// Convert card index to rank and suit
export function indexToCard(index) {
  const rank = index % 13;
  const suit = Math.floor(index / 13);
  return { rank, suit };
}

// Convert rank and suit to card index
export function cardToIndex(rank, suit) {
  return suit * 13 + rank;
}

// Get human-readable card string
export function cardToString(index) {
  const { rank, suit } = indexToCard(index);
  return RANKS[rank] + SUITS[suit];
}

// Parse card string to index
export function parseCard(str) {
  const rankChar = str[0].toUpperCase();
  const suitChar = str[1].toLowerCase();
  const rank = RANKS.indexOf(rankChar === '1' && str[1] === '0' ? 'T' : rankChar);
  const suit = SUITS.indexOf(suitChar);
  if (rank === -1 || suit === -1) {
    throw new Error(`Invalid card: ${str}`);
  }
  return cardToIndex(rank, suit);
}

// Create card point from index
// Each card maps to a unique point: (index + 1) * G
export async function cardIndexToPoint(index) {
  await init();
  return await scalarMul(BASE8, BigInt(index + 1));
}

// Create initial deck (52 unmasked cards)
export async function createDeck() {
  await init();
  const deck = [];
  for (let i = 0; i < 52; i++) {
    const point = await cardIndexToPoint(i);
    deck.push(createCard(point));
  }
  return deck;
}

// Get rank prime for hand evaluation
export function getRankPrime(rank) {
  return RANK_PRIMES[rank];
}

// Calculate lookup key for 5 cards (product of rank primes)
export function calculateLookupKey(cardIndices) {
  if (cardIndices.length !== 5) {
    throw new Error('Need exactly 5 cards for lookup key');
  }
  let key = 1n;
  for (const idx of cardIndices) {
    const { rank } = indexToCard(idx);
    key *= RANK_PRIMES[rank];
  }
  return key;
}

// Check if 5 cards form a flush
export function isFlush(cardIndices) {
  if (cardIndices.length !== 5) {
    throw new Error('Need exactly 5 cards for flush check');
  }
  const suits = cardIndices.map(idx => indexToCard(idx).suit);
  return suits.every(s => s === suits[0]);
}

// Find card index from point by brute force
// (Used for unmasking - compare decrypted point to known card points)
export async function findCardFromPoint(point, precomputedPoints = null) {
  await init();

  // Use precomputed points if available
  if (precomputedPoints) {
    for (let i = 0; i < 52; i++) {
      if (precomputedPoints[i][0] === point[0] && precomputedPoints[i][1] === point[1]) {
        return i;
      }
    }
    return -1;
  }

  // Otherwise compute on the fly
  for (let i = 0; i < 52; i++) {
    const cardPoint = await cardIndexToPoint(i);
    if (cardPoint[0] === point[0] && cardPoint[1] === point[1]) {
      return i;
    }
  }
  return -1;
}

// Precompute all card points for fast lookup
export async function precomputeCardPoints() {
  await init();
  const points = [];
  for (let i = 0; i < 52; i++) {
    points.push(await cardIndexToPoint(i));
  }
  return points;
}
