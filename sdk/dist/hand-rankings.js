// Poker Hand Rankings Generator
// Generates Merkle tree lookup tables for all 7,462 distinct poker hands
import { RANK_PRIMES } from './cards.js';
import { pedersenHash } from './pedersen.js';
// Hand categories (lower rank = better hand)
export var HandCategory;
(function (HandCategory) {
    HandCategory[HandCategory["RoyalFlush"] = 0] = "RoyalFlush";
    HandCategory[HandCategory["StraightFlush"] = 1] = "StraightFlush";
    HandCategory[HandCategory["FourOfAKind"] = 2] = "FourOfAKind";
    HandCategory[HandCategory["FullHouse"] = 3] = "FullHouse";
    HandCategory[HandCategory["Flush"] = 4] = "Flush";
    HandCategory[HandCategory["Straight"] = 5] = "Straight";
    HandCategory[HandCategory["ThreeOfAKind"] = 6] = "ThreeOfAKind";
    HandCategory[HandCategory["TwoPair"] = 7] = "TwoPair";
    HandCategory[HandCategory["OnePair"] = 8] = "OnePair";
    HandCategory[HandCategory["HighCard"] = 9] = "HighCard";
})(HandCategory || (HandCategory = {}));
// Generate all combinations of k elements from array
function* combinations(array, k) {
    if (k === 0) {
        yield [];
        return;
    }
    if (array.length < k)
        return;
    for (let i = 0; i <= array.length - k; i++) {
        for (const combo of combinations(array.slice(i + 1), k - 1)) {
            yield [array[i], ...combo];
        }
    }
}
// Rank indices (0=2, 1=3, ..., 12=A)
const RANKS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const RANK_NAMES = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
// Compute prime product for a set of rank indices
function primeProduct(ranks) {
    return ranks.reduce((acc, r) => acc * RANK_PRIMES[r], 1n);
}
// Check if ranks form a straight (5 consecutive)
function isStraight(sortedRanks) {
    // Check for A-2-3-4-5 (wheel)
    if (sortedRanks[0] === 0 && sortedRanks[1] === 1 && sortedRanks[2] === 2 &&
        sortedRanks[3] === 3 && sortedRanks[4] === 12) {
        return true;
    }
    // Check for consecutive
    for (let i = 1; i < 5; i++) {
        if (sortedRanks[i] !== sortedRanks[i - 1] + 1)
            return false;
    }
    return true;
}
// Get rank counts (for pair/trips/quads detection)
function getRankCounts(ranks) {
    const counts = new Map();
    for (const r of ranks) {
        counts.set(r, (counts.get(r) || 0) + 1);
    }
    return counts;
}
// Generate all hand rankings
export function generateHandRankings() {
    const basicHands = [];
    const flushHands = [];
    let currentRank = 0;
    // ==================== FLUSH HANDS ====================
    // These are stored in a separate table because flush detection
    // happens independently of rank combinations
    // Royal Flush (A K Q J T suited) - rank 0
    flushHands.push({
        primeProduct: primeProduct([12, 11, 10, 9, 8]), // A K Q J T
        rank: currentRank++,
        category: HandCategory.RoyalFlush,
        description: 'Royal Flush',
        isFlush: true,
    });
    // Straight Flushes (K-high down to 6-high, wheel handled separately)
    // K Q J T 9 suited through 6 5 4 3 2 suited
    const straightFlushHighCards = [11, 10, 9, 8, 7, 6, 5, 4]; // K through 6
    for (const high of straightFlushHighCards) {
        const ranks = [high, high - 1, high - 2, high - 3, high - 4];
        flushHands.push({
            primeProduct: primeProduct(ranks),
            rank: currentRank++,
            category: HandCategory.StraightFlush,
            description: `Straight Flush ${RANK_NAMES[high]}-high`,
            isFlush: true,
        });
    }
    // Wheel straight flush (5-4-3-2-A)
    flushHands.push({
        primeProduct: primeProduct([3, 2, 1, 0, 12]), // 5 4 3 2 A
        rank: currentRank++,
        category: HandCategory.StraightFlush,
        description: 'Straight Flush 5-high (wheel)',
        isFlush: true,
    });
    // Now generate all flush hands (non-straight)
    // These are all 5-card combinations that don't form a straight
    const flushRankStart = currentRank;
    const allFlushCombos = [];
    for (const combo of combinations(RANKS, 5)) {
        const sorted = [...combo].sort((a, b) => a - b);
        if (!isStraight(sorted)) {
            allFlushCombos.push({
                ranks: sorted,
                product: primeProduct(sorted),
            });
        }
    }
    // Sort flush hands by strength (higher cards = better)
    allFlushCombos.sort((a, b) => {
        for (let i = 4; i >= 0; i--) {
            if (b.ranks[i] !== a.ranks[i])
                return b.ranks[i] - a.ranks[i];
        }
        return 0;
    });
    for (const { ranks, product } of allFlushCombos) {
        flushHands.push({
            primeProduct: product,
            rank: currentRank++,
            category: HandCategory.Flush,
            description: `Flush ${ranks.map(r => RANK_NAMES[r]).reverse().join(' ')}`,
            isFlush: true,
        });
    }
    // ==================== NON-FLUSH HANDS ====================
    // Reset rank counter for basic (non-flush) hands
    currentRank = 0;
    // Four of a Kind
    // For each quad rank, combine with each kicker rank
    for (let quadRank = 12; quadRank >= 0; quadRank--) {
        for (let kicker = 12; kicker >= 0; kicker--) {
            if (kicker === quadRank)
                continue;
            basicHands.push({
                primeProduct: RANK_PRIMES[quadRank] ** 4n * RANK_PRIMES[kicker],
                rank: currentRank++,
                category: HandCategory.FourOfAKind,
                description: `Four ${RANK_NAMES[quadRank]}s with ${RANK_NAMES[kicker]} kicker`,
                isFlush: false,
            });
        }
    }
    // Full House
    // For each trips rank, combine with each pair rank
    for (let tripsRank = 12; tripsRank >= 0; tripsRank--) {
        for (let pairRank = 12; pairRank >= 0; pairRank--) {
            if (pairRank === tripsRank)
                continue;
            basicHands.push({
                primeProduct: RANK_PRIMES[tripsRank] ** 3n * RANK_PRIMES[pairRank] ** 2n,
                rank: currentRank++,
                category: HandCategory.FullHouse,
                description: `Full House ${RANK_NAMES[tripsRank]}s over ${RANK_NAMES[pairRank]}s`,
                isFlush: false,
            });
        }
    }
    // Straights (non-flush)
    // A-high down to 5-high (wheel)
    const straightHighCards = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3]; // A through 5
    for (const high of straightHighCards) {
        let ranks;
        if (high === 3) {
            // Wheel: 5-4-3-2-A
            ranks = [3, 2, 1, 0, 12];
        }
        else {
            ranks = [high, high - 1, high - 2, high - 3, high - 4];
        }
        basicHands.push({
            primeProduct: primeProduct(ranks),
            rank: currentRank++,
            category: HandCategory.Straight,
            description: `Straight ${RANK_NAMES[high === 3 ? 3 : high]}-high`,
            isFlush: false,
        });
    }
    // Three of a Kind
    // For each trips rank, generate all 2-card kicker combos
    for (let tripsRank = 12; tripsRank >= 0; tripsRank--) {
        const otherRanks = RANKS.filter(r => r !== tripsRank);
        const kickerCombos = [];
        for (const combo of combinations(otherRanks, 2)) {
            kickerCombos.push([...combo].sort((a, b) => b - a));
        }
        // Sort by kicker strength
        kickerCombos.sort((a, b) => {
            if (b[0] !== a[0])
                return b[0] - a[0];
            return b[1] - a[1];
        });
        for (const kickers of kickerCombos) {
            basicHands.push({
                primeProduct: RANK_PRIMES[tripsRank] ** 3n * RANK_PRIMES[kickers[0]] * RANK_PRIMES[kickers[1]],
                rank: currentRank++,
                category: HandCategory.ThreeOfAKind,
                description: `Three ${RANK_NAMES[tripsRank]}s`,
                isFlush: false,
            });
        }
    }
    // Two Pair
    // For each pair combo, generate all kicker options
    for (let highPair = 12; highPair >= 1; highPair--) {
        for (let lowPair = highPair - 1; lowPair >= 0; lowPair--) {
            const otherRanks = RANKS.filter(r => r !== highPair && r !== lowPair);
            // Sort kickers high to low
            const sortedKickers = [...otherRanks].sort((a, b) => b - a);
            for (const kicker of sortedKickers) {
                basicHands.push({
                    primeProduct: RANK_PRIMES[highPair] ** 2n * RANK_PRIMES[lowPair] ** 2n * RANK_PRIMES[kicker],
                    rank: currentRank++,
                    category: HandCategory.TwoPair,
                    description: `Two Pair ${RANK_NAMES[highPair]}s and ${RANK_NAMES[lowPair]}s`,
                    isFlush: false,
                });
            }
        }
    }
    // One Pair
    // For each pair rank, generate all 3-card kicker combos
    for (let pairRank = 12; pairRank >= 0; pairRank--) {
        const otherRanks = RANKS.filter(r => r !== pairRank);
        const kickerCombos = [];
        for (const combo of combinations(otherRanks, 3)) {
            kickerCombos.push([...combo].sort((a, b) => b - a));
        }
        // Sort by kicker strength
        kickerCombos.sort((a, b) => {
            for (let i = 0; i < 3; i++) {
                if (b[i] !== a[i])
                    return b[i] - a[i];
            }
            return 0;
        });
        for (const kickers of kickerCombos) {
            basicHands.push({
                primeProduct: RANK_PRIMES[pairRank] ** 2n * RANK_PRIMES[kickers[0]] * RANK_PRIMES[kickers[1]] * RANK_PRIMES[kickers[2]],
                rank: currentRank++,
                category: HandCategory.OnePair,
                description: `Pair of ${RANK_NAMES[pairRank]}s`,
                isFlush: false,
            });
        }
    }
    // High Card (no pair, no straight - those are handled separately)
    const highCardCombos = [];
    for (const combo of combinations(RANKS, 5)) {
        const sorted = [...combo].sort((a, b) => a - b);
        // Skip straights
        if (isStraight(sorted))
            continue;
        // All unique ranks = high card
        highCardCombos.push([...sorted].sort((a, b) => b - a));
    }
    // Sort by card strength
    highCardCombos.sort((a, b) => {
        for (let i = 0; i < 5; i++) {
            if (b[i] !== a[i])
                return b[i] - a[i];
        }
        return 0;
    });
    for (const ranks of highCardCombos) {
        basicHands.push({
            primeProduct: primeProduct(ranks),
            rank: currentRank++,
            category: HandCategory.HighCard,
            description: `High Card ${RANK_NAMES[ranks[0]]}`,
            isFlush: false,
        });
    }
    return { basicHands, flushHands };
}
// Pedersen hash for Merkle tree - matches Noir's std::hash::pedersen_hash
function hashTwo(a, b) {
    return pedersenHash([a, b]);
}
function hashLeaf(primeProduct, rank, isFlush) {
    return pedersenHash([primeProduct, rank, isFlush ? 1n : 0n]);
}
// Fixed Merkle tree depth to match circuit
const MERKLE_DEPTH = 13;
// Build Merkle tree from hand rankings
export function buildMerkleTree(hands) {
    // Compute leaves
    const leaves = hands.map(h => hashLeaf(h.primeProduct, BigInt(h.rank), h.isFlush));
    // Pad to fixed size (2^MERKLE_DEPTH = 8192)
    const size = 2 ** MERKLE_DEPTH;
    if (leaves.length > size) {
        throw new Error(`Too many hands (${leaves.length}) for depth ${MERKLE_DEPTH}`);
    }
    while (leaves.length < size) {
        leaves.push(0n);
    }
    // Build tree bottom-up
    const tree = [leaves];
    let currentLevel = leaves;
    while (currentLevel.length > 1) {
        const nextLevel = [];
        for (let i = 0; i < currentLevel.length; i += 2) {
            nextLevel.push(hashTwo(currentLevel[i], currentLevel[i + 1]));
        }
        tree.push(nextLevel);
        currentLevel = nextLevel;
    }
    return {
        root: tree[tree.length - 1][0],
        leaves: tree[0],
        tree,
    };
}
// Generate Merkle proof for a specific hand
export function getMerkleProof(tree, index) {
    const proof = [];
    const pathBits = [];
    let idx = index;
    for (let level = 0; level < tree.length - 1; level++) {
        const isRight = idx % 2 === 1;
        const siblingIdx = isRight ? idx - 1 : idx + 1;
        proof.push(tree[level][siblingIdx]);
        pathBits.push(isRight);
        idx = Math.floor(idx / 2);
    }
    return { proof, pathBits };
}
// Export lookup table as JSON
export function exportLookupTable(hands) {
    const table = {};
    for (const hand of hands) {
        table[hand.primeProduct.toString()] = hand.rank;
    }
    return JSON.stringify(table, null, 2);
}
// Main generation function
export function generateAllTables() {
    const { basicHands, flushHands } = generateHandRankings();
    const basicTree = buildMerkleTree(basicHands);
    const flushTree = buildMerkleTree(flushHands);
    const basicLookup = {};
    for (const h of basicHands) {
        basicLookup[h.primeProduct.toString()] = h.rank;
    }
    const flushLookup = {};
    for (const h of flushHands) {
        flushLookup[h.primeProduct.toString()] = h.rank;
    }
    return {
        basicHands,
        flushHands,
        basicTree,
        flushTree,
        basicLookup,
        flushLookup,
    };
}
//# sourceMappingURL=hand-rankings.js.map