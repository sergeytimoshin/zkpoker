/**
 * Showdown Circuit Test
 *
 * Generates test cases for circuit_showdown
 */
import { generateAllTables, getMerkleProof } from './hand-rankings.js';
import { pedersenHash } from './pedersen.js';
import { RANK_PRIMES } from './cards.js';
import { toHex, gameStateCommitment } from './game-state.js';
import * as fs from 'fs';
import * as path from 'path';
// Game state constants (must match circuit)
const STREET_SHOWDOWN = 4;
const STATUS_FINISHED = 2;
function rankPrimeProduct(ranks) {
    return ranks.reduce((acc, r) => acc * RANK_PRIMES[r], 1n);
}
function generateShowdownToml(testCase, basicTree, flushTree, basicLookup, flushLookup) {
    const { stackP1Before, stackP2Before, pot, dealer, p1Ranks, p1IsFlush, p2Ranks, p2IsFlush } = testCase;
    // Compute lookup keys
    const p1LookupKey = rankPrimeProduct(p1Ranks);
    const p2LookupKey = rankPrimeProduct(p2Ranks);
    // Get hand ranks from lookup tables
    const p1HandRank = p1IsFlush
        ? flushLookup[p1LookupKey.toString()]
        : basicLookup[p1LookupKey.toString()];
    const p2HandRank = p2IsFlush
        ? flushLookup[p2LookupKey.toString()]
        : basicLookup[p2LookupKey.toString()];
    if (p1HandRank === undefined) {
        throw new Error(`P1 hand not found: ${p1LookupKey}, isFlush: ${p1IsFlush}`);
    }
    if (p2HandRank === undefined) {
        throw new Error(`P2 hand not found: ${p2LookupKey}, isFlush: ${p2IsFlush}`);
    }
    // Get Merkle proofs (use appropriate tree based on flush)
    const p1Tree = p1IsFlush ? flushTree : basicTree;
    const p2Tree = p2IsFlush ? flushTree : basicTree;
    const merkleRoot = basicTree.root; // Use basic tree root as reference
    // For flush hands, we need to use the flush tree but same root verification
    // Actually, the circuit uses the same merkle_root for both - this is a design issue
    // For simplicity, let's test with non-flush hands first
    const { proof: p1Proof, pathBits: p1PathBits } = getMerkleProof(p1Tree.tree, p1HandRank);
    const { proof: p2Proof, pathBits: p2PathBits } = getMerkleProof(p2Tree.tree, p2HandRank);
    // Determine actual winner and final stacks
    let winner;
    let finalStackP1;
    let finalStackP2;
    if (p1HandRank < p2HandRank) {
        winner = 0; // P1 wins
        finalStackP1 = stackP1Before + pot;
        finalStackP2 = stackP2Before;
    }
    else if (p2HandRank < p1HandRank) {
        winner = 1; // P2 wins
        finalStackP1 = stackP1Before;
        finalStackP2 = stackP2Before + pot;
    }
    else {
        winner = 2; // Tie
        const halfPot = Math.floor(pot / 2);
        const remainder = pot - halfPot * 2;
        if (dealer === 1) {
            finalStackP1 = stackP1Before + halfPot + remainder;
            finalStackP2 = stackP2Before + halfPot;
        }
        else {
            finalStackP1 = stackP1Before + halfPot;
            finalStackP2 = stackP2Before + halfPot + remainder;
        }
    }
    // Game state before showdown
    const stateBefore = {
        stackP1: stackP1Before,
        stackP2: stackP2Before,
        pot,
        street: STREET_SHOWDOWN,
        currentPlayer: 1,
        lastAction: 2, // CALL
        lastBetSize: 0,
        streetBetP1: 0,
        streetBetP2: 0,
        status: 1, // IN_PROGRESS
        dealer,
    };
    // Game state after showdown
    const stateAfter = {
        stackP1: finalStackP1,
        stackP2: finalStackP2,
        pot: 0,
        street: STREET_SHOWDOWN,
        currentPlayer: 0,
        lastAction: 0,
        lastBetSize: 0,
        streetBetP1: 0,
        streetBetP2: 0,
        status: STATUS_FINISHED,
        dealer,
    };
    const stateBeforeCommitment = gameStateCommitment(stateBefore);
    const stateAfterCommitment = gameStateCommitment(stateAfter);
    // Placeholder commitments for hole and board cards
    const p1HoleCommitment = pedersenHash([2n, 3n]); // Placeholder
    const p2HoleCommitment = pedersenHash([5n, 7n]); // Placeholder
    const boardCommitment = pedersenHash([11n, 13n, 17n, 19n, 23n]); // Placeholder
    const winnerStr = winner === 0 ? 'P1' : winner === 1 ? 'P2' : 'Tie';
    const toml = `# circuit_showdown Prover.toml
# Test case: ${testCase.name}
# P1 hand rank: ${p1HandRank} (${p1IsFlush ? 'flush' : 'basic'})
# P2 hand rank: ${p2HandRank} (${p2IsFlush ? 'flush' : 'basic'})
# Winner: ${winnerStr}
# Pot: ${pot} -> P1: ${finalStackP1}, P2: ${finalStackP2}

# === Public inputs ===
state_before_commitment = ${toHex(stateBeforeCommitment)}
state_after_commitment = ${toHex(stateAfterCommitment)}
merkle_root = ${toHex(p1IsFlush ? flushTree.root : basicTree.root)}
_p1_hole_commitment = ${toHex(p1HoleCommitment)}
_p2_hole_commitment = ${toHex(p2HoleCommitment)}
_board_commitment = ${toHex(boardCommitment)}

# === Private inputs ===
# Game state before
stack_p1_before = ${stackP1Before}
stack_p2_before = ${stackP2Before}
pot = ${pot}
street = ${STREET_SHOWDOWN}
current_player = 1
last_action = 2
last_bet_size = 0
street_bet_p1 = 0
street_bet_p2 = 0
status = 1
dealer = ${dealer}

# Hand ranks
p1_hand_rank = ${p1HandRank}
p2_hand_rank = ${p2HandRank}

# P1 Merkle proof
p1_lookup_key = ${toHex(p1LookupKey)}
p1_is_flush = ${p1IsFlush}
p1_merkle_proof = [${p1Proof.map(p => toHex(p)).join(', ')}]
p1_merkle_path_bits = [${p1PathBits.join(', ')}]

# P2 Merkle proof
p2_lookup_key = ${toHex(p2LookupKey)}
p2_is_flush = ${p2IsFlush}
p2_merkle_proof = [${p2Proof.map(p => toHex(p)).join(', ')}]
p2_merkle_path_bits = [${p2PathBits.join(', ')}]
`;
    return toml;
}
async function main() {
    console.log('Generating hand rankings and Merkle trees...');
    const { basicHands, flushHands, basicTree, flushTree, basicLookup, flushLookup } = generateAllTables();
    console.log(`Basic hands: ${basicHands.length}, Flush hands: ${flushHands.length}`);
    // Test cases - use same tree type for both players to avoid merkle root mismatch
    const testCases = [
        {
            name: 'P1 wins with better hand',
            stackP1Before: 50, stackP2Before: 50, pot: 100, dealer: 1,
            p1Ranks: [12, 12, 12, 12, 11], // Four Aces with K kicker
            p1IsFlush: false,
            p2Ranks: [11, 11, 11, 10, 9], // Three Kings
            p2IsFlush: false,
            expectedWinner: 'p1',
        },
        {
            name: 'P2 wins with better hand',
            stackP1Before: 75, stackP2Before: 25, pot: 50, dealer: 2,
            p1Ranks: [10, 10, 9, 8, 7], // Pair of Jacks
            p1IsFlush: false,
            p2Ranks: [12, 11, 10, 9, 8], // Straight A-high
            p2IsFlush: false,
            expectedWinner: 'p2',
        },
        {
            name: 'Tie - split pot evenly',
            stackP1Before: 40, stackP2Before: 60, pot: 100, dealer: 1,
            p1Ranks: [12, 11, 10, 9, 7], // High card A K Q J 9
            p1IsFlush: false,
            p2Ranks: [12, 11, 10, 9, 7], // Same high card
            p2IsFlush: false,
            expectedWinner: 'tie',
        },
        {
            name: 'Tie - split odd pot (dealer gets extra)',
            stackP1Before: 45, stackP2Before: 45, pot: 101, dealer: 1,
            p1Ranks: [6, 6, 6, 12, 11], // Three 8s
            p1IsFlush: false,
            p2Ranks: [6, 6, 6, 12, 11], // Same three 8s
            p2IsFlush: false,
            expectedWinner: 'tie',
        },
    ];
    const outputDir = process.argv[2] || './e2e-output';
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    console.log('\nGenerating test cases...\n');
    for (const testCase of testCases) {
        try {
            const toml = generateShowdownToml(testCase, basicTree, flushTree, basicLookup, flushLookup);
            const filename = `showdown_${testCase.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.toml`;
            fs.writeFileSync(path.join(outputDir, filename), toml);
            console.log(`✅ ${testCase.name}: ${filename}`);
        }
        catch (e) {
            console.log(`❌ ${testCase.name}: ${e}`);
        }
    }
    console.log('\nDone!');
}
main().catch(console.error);
//# sourceMappingURL=showdown-test.js.map