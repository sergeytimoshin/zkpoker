// Card encoding constants matching Noir implementation
// 52 cards mapped to first 52 prime numbers

export const DECK_SIZE = 52;
export const MAX_PLAYERS = 10;

// Prime-based card encoding
// Cards ordered by suit (Hearts, Diamonds, Clubs, Spades) then rank (2-A)
// Index 0-12: Hearts 2-A, Index 13-25: Diamonds 2-A, etc.
export const CARD_PRIMES: bigint[] = [
  // Hearts (2h-Ah): indices 0-12
  2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n,
  // Diamonds (2d-Ad): indices 13-25
  43n, 47n, 53n, 59n, 61n, 67n, 71n, 73n, 79n, 83n, 89n, 97n, 101n,
  // Clubs (2c-Ac): indices 26-38
  103n, 107n, 109n, 113n, 127n, 131n, 137n, 139n, 149n, 151n, 157n, 163n, 167n,
  // Spades (2s-As): indices 39-51
  173n, 179n, 181n, 191n, 193n, 197n, 199n, 211n, 223n, 227n, 229n, 233n, 239n,
];

// Rank primes for hand evaluation (suit-independent)
export const RANK_PRIMES: bigint[] = [
  2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n,
];

// Card names for display
export const CARD_NAMES: string[] = [
  // Hearts
  '2h', '3h', '4h', '5h', '6h', '7h', '8h', '9h', 'Th', 'Jh', 'Qh', 'Kh', 'Ah',
  // Diamonds
  '2d', '3d', '4d', '5d', '6d', '7d', '8d', '9d', 'Td', 'Jd', 'Qd', 'Kd', 'Ad',
  // Clubs
  '2c', '3c', '4c', '5c', '6c', '7c', '8c', '9c', 'Tc', 'Jc', 'Qc', 'Kc', 'Ac',
  // Spades
  '2s', '3s', '4s', '5s', '6s', '7s', '8s', '9s', 'Ts', 'Js', 'Qs', 'Ks', 'As',
];

// Get card prime for a given card index
export function getCardPrime(cardIndex: number): bigint {
  if (cardIndex < 0 || cardIndex >= DECK_SIZE) {
    throw new Error(`Card index ${cardIndex} out of range`);
  }
  return CARD_PRIMES[cardIndex];
}

// Get rank prime (suit-independent) for a card index
export function getRankPrime(cardIndex: number): bigint {
  if (cardIndex < 0 || cardIndex >= DECK_SIZE) {
    throw new Error(`Card index ${cardIndex} out of range`);
  }
  const rank = cardIndex % 13;
  return RANK_PRIMES[rank];
}

// Get suit of a card (0=Hearts, 1=Diamonds, 2=Clubs, 3=Spades)
export function getSuit(cardIndex: number): number {
  if (cardIndex < 0 || cardIndex >= DECK_SIZE) {
    throw new Error(`Card index ${cardIndex} out of range`);
  }
  return Math.floor(cardIndex / 13);
}

// Get rank of a card (0=2, 1=3, ..., 12=A)
export function getRank(cardIndex: number): number {
  if (cardIndex < 0 || cardIndex >= DECK_SIZE) {
    throw new Error(`Card index ${cardIndex} out of range`);
  }
  return cardIndex % 13;
}

// Get human-readable card name
export function getCardName(cardIndex: number): string {
  if (cardIndex < 0 || cardIndex >= DECK_SIZE) {
    throw new Error(`Card index ${cardIndex} out of range`);
  }
  return CARD_NAMES[cardIndex];
}
