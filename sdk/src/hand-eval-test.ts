/**
 * Hand Evaluation Circuit Test
 *
 * Generates test cases for circuit_hand_eval with proper Merkle proofs
 */

import { generateAllTables, getMerkleProof, HandCategory } from './hand-rankings.js';
import { pedersenHash } from './pedersen.js';
import { RANK_PRIMES } from './cards.js';
import { toHex } from './game-state.js';
import * as fs from 'fs';
import * as path from 'path';

// Card index to suit (0-3)
function getSuit(cardIndex: number): number {
  return Math.floor(cardIndex / 13);
}

// Card index to rank (0-12)
function getRank(cardIndex: number): number {
  return cardIndex % 13;
}

// Card name for display
function cardName(cardIndex: number): string {
  const suits = ['♥', '♦', '♣', '♠'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  return `${ranks[getRank(cardIndex)]}${suits[getSuit(cardIndex)]}`;
}

// Compute prime product for rank indices
function rankPrimeProduct(ranks: number[]): bigint {
  return ranks.reduce((acc, r) => acc * RANK_PRIMES[r], 1n);
}

interface TestCase {
  name: string;
  holeCards: [number, number];
  boardCards: [number, number, number, number, number];
  bestHand: [boolean, boolean, boolean, boolean, boolean, boolean, boolean]; // use_hole_0, use_hole_1, use_board_0..4
  isFlush: boolean;
  expectedCategory: HandCategory;
}

function generateProverToml(
  testCase: TestCase,
  basicTree: { root: bigint; leaves: bigint[]; tree: bigint[][] },
  flushTree: { root: bigint; leaves: bigint[]; tree: bigint[][] },
  basicLookup: Record<string, number>,
  flushLookup: Record<string, number>,
): string {
  const { holeCards, boardCards, bestHand, isFlush } = testCase;

  // Compute hole cards commitment (using card primes based on card index)
  // The circuit uses CARD_PRIMES[card_index] for commitment
  // But we need to use the card's prime based on its index in the full deck
  const hole0Prime = RANK_PRIMES[getRank(holeCards[0])];
  const hole1Prime = RANK_PRIMES[getRank(holeCards[1])];

  // For hole cards commitment, the circuit hashes the actual card primes (from index)
  // Let me re-read the circuit to understand what it expects...
  // The circuit uses: CARD_PRIMES[hole_card_0] where hole_card_0 is the card INDEX (0-51)
  // So we need to check zkpoker_primitives::constants::CARD_PRIMES

  // Actually looking at the circuit more carefully:
  // - hole_card_0, hole_card_1 are u32 indices 0-51
  // - CARD_PRIMES[hole_card_0] gives the prime for that card
  // - But for hand evaluation, it uses get_rank_prime(card_index) which gives rank-only prime

  // So the commitment uses the FULL card primes (52 unique primes)
  // But the lookup uses RANK primes (13 primes, power based on count)

  // Let me look at the constants in the circuit
  // For now, assume CARD_PRIMES in the circuit matches our SDK's card primes
  // which are per-card (52 primes) ordered by suit then rank

  // Actually, reading the circuit again:
  // computed_hole_commitment = pedersen_hash([CARD_PRIMES[hole_card_0], CARD_PRIMES[hole_card_1]])
  // This uses card-specific primes for commitment

  // For lookup_key calculation:
  // lookup_key = lookup_key * get_rank_prime(hole_card_0)
  // This uses rank-only primes

  // Let's use the card primes from the SDK for commitment
  // The SDK's card.ts has CARD_PRIMES ordered by suit (Hearts, Diamonds, Clubs, Spades)
  // Each suit has 13 cards (2-A), so card i has prime CARD_PRIMES[i]

  // Import the actual card primes
  const CARD_PRIMES_FULL: bigint[] = [
    // Hearts (2h-Ah): indices 0-12
    2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n,
    // Diamonds (2d-Ad): indices 13-25
    43n, 47n, 53n, 59n, 61n, 67n, 71n, 73n, 79n, 83n, 89n, 97n, 101n,
    // Clubs (2c-Ac): indices 26-38
    103n, 107n, 109n, 113n, 127n, 131n, 137n, 139n, 149n, 151n, 157n, 163n, 167n,
    // Spades (2s-As): indices 39-51
    173n, 179n, 181n, 191n, 193n, 197n, 199n, 211n, 223n, 227n, 229n, 233n, 239n,
  ];

  const holeCardsCommitment = pedersenHash([
    CARD_PRIMES_FULL[holeCards[0]],
    CARD_PRIMES_FULL[holeCards[1]],
  ]);

  const boardCardsCommitment = pedersenHash([
    CARD_PRIMES_FULL[boardCards[0]],
    CARD_PRIMES_FULL[boardCards[1]],
    CARD_PRIMES_FULL[boardCards[2]],
    CARD_PRIMES_FULL[boardCards[3]],
    CARD_PRIMES_FULL[boardCards[4]],
  ]);

  // Determine which cards are used and compute lookup key
  const allCards = [...holeCards, ...boardCards];
  const usedIndices: number[] = [];
  for (let i = 0; i < 7; i++) {
    if (bestHand[i]) {
      usedIndices.push(i);
    }
  }

  // Compute lookup key (product of RANK primes for used cards)
  const usedRanks = usedIndices.map(i => getRank(allCards[i]));
  const lookupKey = rankPrimeProduct(usedRanks);

  // Find hand rank in appropriate table
  let handRank: number;
  let merkleRoot: bigint;
  let tree: bigint[][];

  if (isFlush) {
    handRank = flushLookup[lookupKey.toString()];
    merkleRoot = flushTree.root;
    tree = flushTree.tree;
  } else {
    handRank = basicLookup[lookupKey.toString()];
    merkleRoot = basicTree.root;
    tree = basicTree.tree;
  }

  if (handRank === undefined) {
    throw new Error(`Hand not found in lookup table. Key: ${lookupKey}, isFlush: ${isFlush}`);
  }

  // Get Merkle proof (tree already has depth 13)
  const { proof, pathBits } = getMerkleProof(tree, handRank);

  // Generate TOML
  const toml = `# circuit_hand_eval Prover.toml
# Test case: ${testCase.name}
# Hole cards: ${cardName(holeCards[0])} ${cardName(holeCards[1])}
# Board: ${boardCards.map(cardName).join(' ')}
# Best 5: ${usedIndices.map(i => cardName(allCards[i])).join(' ')}
# Category: ${HandCategory[testCase.expectedCategory]}

# === Public inputs ===
merkle_root = ${toHex(merkleRoot)}
hole_cards_commitment = ${toHex(holeCardsCommitment)}
board_cards_commitment = ${toHex(boardCardsCommitment)}
hand_rank = ${toHex(BigInt(handRank))}

# === Private inputs ===
# Hole cards (indices 0-51)
hole_card_0 = ${holeCards[0]}
hole_card_1 = ${holeCards[1]}

# Board cards (indices 0-51)
board_card_0 = ${boardCards[0]}
board_card_1 = ${boardCards[1]}
board_card_2 = ${boardCards[2]}
board_card_3 = ${boardCards[3]}
board_card_4 = ${boardCards[4]}

# Which 5 cards form the best hand
use_hole_0 = ${bestHand[0]}
use_hole_1 = ${bestHand[1]}
use_board_0 = ${bestHand[2]}
use_board_1 = ${bestHand[3]}
use_board_2 = ${bestHand[4]}
use_board_3 = ${bestHand[5]}
use_board_4 = ${bestHand[6]}

# Is this hand a flush?
is_flush = ${isFlush}

# Merkle proof (depth 13)
merkle_proof = [${proof.map(p => toHex(p)).join(', ')}]
merkle_path_bits = [${pathBits.join(', ')}]
`;

  return toml;
}

async function main() {
  console.log('Generating hand rankings and Merkle trees...');
  const { basicHands, flushHands, basicTree, flushTree, basicLookup, flushLookup } = generateAllTables();

  console.log(`Basic hands: ${basicHands.length}`);
  console.log(`Flush hands: ${flushHands.length}`);
  console.log(`Basic tree root: 0x${basicTree.root.toString(16).slice(0, 16)}...`);
  console.log(`Flush tree root: 0x${flushTree.root.toString(16).slice(0, 16)}...`);

  // Test cases covering different hand types
  const testCases: TestCase[] = [
    {
      name: 'Royal Flush',
      // A♠ K♠ hole, Q♠ J♠ T♠ x x board
      holeCards: [51, 50], // A♠, K♠
      boardCards: [49, 48, 47, 0, 13], // Q♠, J♠, T♠, 2♥, 2♦
      bestHand: [true, true, true, true, true, false, false],
      isFlush: true,
      expectedCategory: HandCategory.RoyalFlush,
    },
    {
      name: 'Four of a Kind (Aces)',
      // A♠ A♥ hole, A♦ A♣ K♠ x x board
      holeCards: [51, 12], // A♠, A♥
      boardCards: [25, 38, 50, 0, 13], // A♦, A♣, K♠, 2♥, 2♦
      bestHand: [true, true, true, true, true, false, false],
      isFlush: false,
      expectedCategory: HandCategory.FourOfAKind,
    },
    {
      name: 'Full House (Kings over Queens)',
      // K♠ K♥ hole, K♦ Q♠ Q♥ x x board
      holeCards: [50, 11], // K♠, K♥
      boardCards: [24, 49, 10, 0, 13], // K♦, Q♠, Q♥, 2♥, 2♦
      bestHand: [true, true, true, true, true, false, false],
      isFlush: false,
      expectedCategory: HandCategory.FullHouse,
    },
    {
      name: 'Flush (Hearts)',
      // A♥ K♥ hole, Q♥ T♥ 5♥ x x board
      holeCards: [12, 11], // A♥, K♥
      boardCards: [10, 8, 3, 26, 39], // Q♥, T♥, 5♥, 2♣, 2♠
      bestHand: [true, true, true, true, true, false, false],
      isFlush: true,
      expectedCategory: HandCategory.Flush,
    },
    {
      name: 'Straight (9-high)',
      // 9♠ 8♥ hole, 7♦ 6♣ 5♠ x x board
      holeCards: [46, 6], // 9♠, 8♥
      boardCards: [18, 30, 42, 0, 13], // 7♦, 6♣, 5♠, 2♥, 2♦
      bestHand: [true, true, true, true, true, false, false],
      isFlush: false,
      expectedCategory: HandCategory.Straight,
    },
    {
      name: 'Three of a Kind (Jacks)',
      // J♠ J♥ hole, J♦ A♠ K♠ x x board
      holeCards: [48, 9], // J♠, J♥
      boardCards: [22, 51, 50, 0, 13], // J♦, A♠, K♠, 2♥, 2♦
      bestHand: [true, true, true, true, true, false, false],
      isFlush: false,
      expectedCategory: HandCategory.ThreeOfAKind,
    },
    {
      name: 'Two Pair (Aces and Kings)',
      // A♠ K♠ hole, A♥ K♥ Q♠ x x board
      holeCards: [51, 50], // A♠, K♠
      boardCards: [12, 11, 49, 0, 13], // A♥, K♥, Q♠, 2♥, 2♦
      bestHand: [true, true, true, true, true, false, false],
      isFlush: false,
      expectedCategory: HandCategory.TwoPair,
    },
    {
      name: 'One Pair (Aces)',
      // A♠ K♠ hole, A♥ Q♥ J♥ x x board
      holeCards: [51, 50], // A♠, K♠
      boardCards: [12, 10, 9, 0, 13], // A♥, Q♥, J♥, 2♥, 2♦
      bestHand: [true, true, true, true, true, false, false],
      isFlush: false,
      expectedCategory: HandCategory.OnePair,
    },
    {
      name: 'High Card (Ace high)',
      // A♠ K♦ hole, Q♣ J♥ 9♠ x x board (no flush, no straight)
      holeCards: [51, 24], // A♠, K♦
      boardCards: [36, 9, 46, 0, 13], // Q♣, J♥, 9♠, 2♥, 2♦
      bestHand: [true, true, true, true, true, false, false],
      isFlush: false,
      expectedCategory: HandCategory.HighCard,
    },
  ];

  const outputDir = process.argv[2] || './e2e-output';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('\nGenerating test cases...\n');

  for (const testCase of testCases) {
    try {
      const toml = generateProverToml(testCase, basicTree, flushTree, basicLookup, flushLookup);
      const filename = `hand_eval_${testCase.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.toml`;
      fs.writeFileSync(path.join(outputDir, filename), toml);
      console.log(`✅ ${testCase.name}: ${filename}`);
    } catch (e) {
      console.log(`❌ ${testCase.name}: ${e}`);
    }
  }

  console.log('\nDone! Test files written to', outputDir);
}

main().catch(console.error);
