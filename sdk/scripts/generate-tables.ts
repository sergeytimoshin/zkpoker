#!/usr/bin/env npx ts-node
// Script to generate hand ranking lookup tables

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Hand rankings generator (inline to avoid module issues)
const RANK_PRIMES: bigint[] = [
  2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n
];

const RANKS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const RANK_NAMES = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

interface HandRanking {
  primeProduct: bigint;
  rank: number;
  category: string;
  isFlush: boolean;
}

function* combinations<T>(array: T[], k: number): Generator<T[]> {
  if (k === 0) { yield []; return; }
  if (array.length < k) return;
  for (let i = 0; i <= array.length - k; i++) {
    for (const combo of combinations(array.slice(i + 1), k - 1)) {
      yield [array[i], ...combo];
    }
  }
}

function primeProduct(ranks: number[]): bigint {
  return ranks.reduce((acc, r) => acc * RANK_PRIMES[r], 1n);
}

function isStraight(sortedRanks: number[]): boolean {
  if (sortedRanks[0] === 0 && sortedRanks[1] === 1 && sortedRanks[2] === 2 &&
      sortedRanks[3] === 3 && sortedRanks[4] === 12) return true;
  for (let i = 1; i < 5; i++) {
    if (sortedRanks[i] !== sortedRanks[i - 1] + 1) return false;
  }
  return true;
}

function generateHandRankings(): { basicHands: HandRanking[]; flushHands: HandRanking[] } {
  const basicHands: HandRanking[] = [];
  const flushHands: HandRanking[] = [];
  let flushRank = 0;
  let basicRank = 0;

  // === FLUSH HANDS ===

  // Royal Flush
  flushHands.push({ primeProduct: primeProduct([12, 11, 10, 9, 8]), rank: flushRank++, category: 'RoyalFlush', isFlush: true });

  // Straight Flushes
  for (const high of [11, 10, 9, 8, 7, 6, 5, 4, 3]) {
    const ranks = high === 3 ? [3, 2, 1, 0, 12] : [high, high-1, high-2, high-3, high-4];
    flushHands.push({ primeProduct: primeProduct(ranks), rank: flushRank++, category: 'StraightFlush', isFlush: true });
  }
  // Wheel
  flushHands.push({ primeProduct: primeProduct([3, 2, 1, 0, 12]), rank: flushRank++, category: 'StraightFlush', isFlush: true });

  // Regular Flushes (non-straight)
  const flushCombos: { ranks: number[]; product: bigint }[] = [];
  for (const combo of combinations(RANKS, 5)) {
    const sorted = [...combo].sort((a, b) => a - b);
    if (!isStraight(sorted)) {
      flushCombos.push({ ranks: sorted, product: primeProduct(sorted) });
    }
  }
  flushCombos.sort((a, b) => {
    for (let i = 4; i >= 0; i--) {
      if (b.ranks[i] !== a.ranks[i]) return b.ranks[i] - a.ranks[i];
    }
    return 0;
  });
  for (const { product } of flushCombos) {
    flushHands.push({ primeProduct: product, rank: flushRank++, category: 'Flush', isFlush: true });
  }

  // === BASIC HANDS ===

  // Four of a Kind
  for (let quadRank = 12; quadRank >= 0; quadRank--) {
    for (let kicker = 12; kicker >= 0; kicker--) {
      if (kicker === quadRank) continue;
      basicHands.push({
        primeProduct: RANK_PRIMES[quadRank] ** 4n * RANK_PRIMES[kicker],
        rank: basicRank++,
        category: 'FourOfAKind',
        isFlush: false,
      });
    }
  }

  // Full House
  for (let tripsRank = 12; tripsRank >= 0; tripsRank--) {
    for (let pairRank = 12; pairRank >= 0; pairRank--) {
      if (pairRank === tripsRank) continue;
      basicHands.push({
        primeProduct: RANK_PRIMES[tripsRank] ** 3n * RANK_PRIMES[pairRank] ** 2n,
        rank: basicRank++,
        category: 'FullHouse',
        isFlush: false,
      });
    }
  }

  // Straights (non-flush)
  for (const high of [12, 11, 10, 9, 8, 7, 6, 5, 4, 3]) {
    const ranks = high === 3 ? [3, 2, 1, 0, 12] : [high, high-1, high-2, high-3, high-4];
    basicHands.push({ primeProduct: primeProduct(ranks), rank: basicRank++, category: 'Straight', isFlush: false });
  }

  // Three of a Kind
  for (let tripsRank = 12; tripsRank >= 0; tripsRank--) {
    const otherRanks = RANKS.filter(r => r !== tripsRank);
    const kickerCombos: number[][] = [];
    for (const combo of combinations(otherRanks, 2)) {
      kickerCombos.push([...combo].sort((a, b) => b - a));
    }
    kickerCombos.sort((a, b) => (b[0] - a[0]) || (b[1] - a[1]));
    for (const kickers of kickerCombos) {
      basicHands.push({
        primeProduct: RANK_PRIMES[tripsRank] ** 3n * RANK_PRIMES[kickers[0]] * RANK_PRIMES[kickers[1]],
        rank: basicRank++,
        category: 'ThreeOfAKind',
        isFlush: false,
      });
    }
  }

  // Two Pair
  for (let highPair = 12; highPair >= 1; highPair--) {
    for (let lowPair = highPair - 1; lowPair >= 0; lowPair--) {
      const otherRanks = RANKS.filter(r => r !== highPair && r !== lowPair).sort((a, b) => b - a);
      for (const kicker of otherRanks) {
        basicHands.push({
          primeProduct: RANK_PRIMES[highPair] ** 2n * RANK_PRIMES[lowPair] ** 2n * RANK_PRIMES[kicker],
          rank: basicRank++,
          category: 'TwoPair',
          isFlush: false,
        });
      }
    }
  }

  // One Pair
  for (let pairRank = 12; pairRank >= 0; pairRank--) {
    const otherRanks = RANKS.filter(r => r !== pairRank);
    const kickerCombos: number[][] = [];
    for (const combo of combinations(otherRanks, 3)) {
      kickerCombos.push([...combo].sort((a, b) => b - a));
    }
    kickerCombos.sort((a, b) => {
      for (let i = 0; i < 3; i++) { if (b[i] !== a[i]) return b[i] - a[i]; }
      return 0;
    });
    for (const kickers of kickerCombos) {
      basicHands.push({
        primeProduct: RANK_PRIMES[pairRank] ** 2n * RANK_PRIMES[kickers[0]] * RANK_PRIMES[kickers[1]] * RANK_PRIMES[kickers[2]],
        rank: basicRank++,
        category: 'OnePair',
        isFlush: false,
      });
    }
  }

  // High Card
  const highCardCombos: number[][] = [];
  for (const combo of combinations(RANKS, 5)) {
    const sorted = [...combo].sort((a, b) => a - b);
    if (!isStraight(sorted)) {
      highCardCombos.push([...sorted].sort((a, b) => b - a));
    }
  }
  highCardCombos.sort((a, b) => {
    for (let i = 0; i < 5; i++) { if (b[i] !== a[i]) return b[i] - a[i]; }
    return 0;
  });
  for (const ranks of highCardCombos) {
    basicHands.push({ primeProduct: primeProduct(ranks), rank: basicRank++, category: 'HighCard', isFlush: false });
  }

  return { basicHands, flushHands };
}

// Main
console.log('Generating poker hand rankings...');
const { basicHands, flushHands } = generateHandRankings();

console.log(`Generated ${basicHands.length} basic hands`);
console.log(`Generated ${flushHands.length} flush hands`);
console.log(`Total: ${basicHands.length + flushHands.length} hands`);

// Create lookup tables
const basicLookup: Record<string, number> = {};
for (const h of basicHands) {
  basicLookup[h.primeProduct.toString()] = h.rank;
}

const flushLookup: Record<string, number> = {};
for (const h of flushHands) {
  flushLookup[h.primeProduct.toString()] = h.rank;
}

// Write to files
const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', '..', 'data');

try {
  mkdirSync(dataDir, { recursive: true });
} catch (e) {}

writeFileSync(
  join(dataDir, 'lookup_table_basic.json'),
  JSON.stringify(basicLookup, null, 2)
);
console.log(`Wrote ${Object.keys(basicLookup).length} entries to lookup_table_basic.json`);

writeFileSync(
  join(dataDir, 'lookup_table_flush.json'),
  JSON.stringify(flushLookup, null, 2)
);
console.log(`Wrote ${Object.keys(flushLookup).length} entries to lookup_table_flush.json`);

// Also write detailed hand info for debugging
const basicDetails = basicHands.map(h => ({
  prime: h.primeProduct.toString(),
  rank: h.rank,
  category: h.category,
}));
writeFileSync(
  join(dataDir, 'hands_basic_detailed.json'),
  JSON.stringify(basicDetails, null, 2)
);

const flushDetails = flushHands.map(h => ({
  prime: h.primeProduct.toString(),
  rank: h.rank,
  category: h.category,
}));
writeFileSync(
  join(dataDir, 'hands_flush_detailed.json'),
  JSON.stringify(flushDetails, null, 2)
);

console.log('\nDone! Lookup tables written to data/ directory.');

// Print some examples
console.log('\n=== Sample Rankings ===');
console.log('Best flush hands:');
for (let i = 0; i < 5; i++) {
  console.log(`  ${i}: ${flushHands[i].category} (prime: ${flushHands[i].primeProduct})`);
}
console.log('Best basic hands:');
for (let i = 0; i < 5; i++) {
  console.log(`  ${i}: ${basicHands[i].category} (prime: ${basicHands[i].primeProduct})`);
}
console.log('Worst hands:');
console.log(`  Basic ${basicHands.length - 1}: ${basicHands[basicHands.length - 1].category}`);
console.log(`  Flush ${flushHands.length - 1}: ${flushHands[flushHands.length - 1].category}`);
