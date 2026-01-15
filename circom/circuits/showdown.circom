pragma circom 2.1.0;

// Showdown Circuit
// Proves winner determination and pot distribution at showdown

include "card_commitment.circom";
include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/mux1.circom";

template Showdown() {
    // === Public inputs ===
    signal input stateBeforeCommitment;
    signal input stateAfterCommitment;
    signal input merkleRoot;
    signal input p1HoleCommitment;
    signal input p2HoleCommitment;
    signal input boardCommitment;

    // === Private inputs ===
    // Game state before showdown
    signal input stackP1Before;
    signal input stackP2Before;
    signal input pot;
    signal input street;
    signal input currentPlayer;
    signal input lastAction;
    signal input lastBetSize;
    signal input streetBetP1;
    signal input streetBetP2;
    signal input status;
    signal input dealer;

    // Hand ranks (lower is better)
    signal input p1HandRank;
    signal input p2HandRank;

    // Merkle proofs for hand ranks
    signal input p1LookupKey;
    signal input p1IsFlush;
    signal input p1MerkleProof[13];
    signal input p1MerklePathBits[13];

    signal input p2LookupKey;
    signal input p2IsFlush;
    signal input p2MerkleProof[13];
    signal input p2MerklePathBits[13];

    // === Verify state before commitment ===
    component commitBefore = GameStateCommitment();
    commitBefore.stackP1 <== stackP1Before;
    commitBefore.stackP2 <== stackP2Before;
    commitBefore.pot <== pot;
    commitBefore.street <== street;
    commitBefore.currentPlayer <== currentPlayer;
    commitBefore.lastAction <== lastAction;
    commitBefore.lastBetSize <== lastBetSize;
    commitBefore.streetBetP1 <== streetBetP1;
    commitBefore.streetBetP2 <== streetBetP2;
    commitBefore.status <== status;
    commitBefore.dealer <== dealer;
    commitBefore.out === stateBeforeCommitment;

    // === Verify at showdown (street == 4) ===
    street === 4;

    // === Verify P1's hand rank via Merkle proof ===
    component p1Leaf = Poseidon(3);
    p1Leaf.inputs[0] <== p1LookupKey;
    p1Leaf.inputs[1] <== p1HandRank;
    p1Leaf.inputs[2] <== p1IsFlush;

    component p1Merkle = MerkleProof(13);
    p1Merkle.leaf <== p1Leaf.out;
    for (var i = 0; i < 13; i++) {
        p1Merkle.pathElements[i] <== p1MerkleProof[i];
        p1Merkle.pathIndices[i] <== p1MerklePathBits[i];
    }
    p1Merkle.root === merkleRoot;

    // === Verify P2's hand rank via Merkle proof ===
    component p2Leaf = Poseidon(3);
    p2Leaf.inputs[0] <== p2LookupKey;
    p2Leaf.inputs[1] <== p2HandRank;
    p2Leaf.inputs[2] <== p2IsFlush;

    component p2Merkle = MerkleProof(13);
    p2Merkle.leaf <== p2Leaf.out;
    for (var i = 0; i < 13; i++) {
        p2Merkle.pathElements[i] <== p2MerkleProof[i];
        p2Merkle.pathIndices[i] <== p2MerklePathBits[i];
    }
    p2Merkle.root === merkleRoot;

    // === Determine winner (lower rank = better hand) ===
    component p1Wins = LessThan(32);
    p1Wins.in[0] <== p1HandRank;
    p1Wins.in[1] <== p2HandRank;

    component p2Wins = LessThan(32);
    p2Wins.in[0] <== p2HandRank;
    p2Wins.in[1] <== p1HandRank;

    component isTie = IsEqual();
    isTie.in[0] <== p1HandRank;
    isTie.in[1] <== p2HandRank;

    // === Distribute pot ===
    // P1 wins: P1 gets pot
    // P2 wins: P2 gets pot
    // Tie: split (dealer gets odd chip)
    signal halfPot <-- pot \ 2;  // Witness hint for integer division
    signal remainder <-- pot % 2;  // Witness hint for remainder
    // Constraint: halfPot * 2 + remainder == pot
    halfPot * 2 + remainder === pot;
    // Constraint: remainder is 0 or 1
    remainder * (1 - remainder) === 0;

    // P1's share
    signal p1WinShare <== p1Wins.out * pot;
    signal tieShareP1Base <== isTie.out * halfPot;

    // Dealer gets odd chip on tie
    component dealerIs1 = IsEqual();
    dealerIs1.in[0] <== dealer;
    dealerIs1.in[1] <== 1;
    signal tieAndDealer1 <== isTie.out * dealerIs1.out;
    signal tieOddP1 <== tieAndDealer1 * remainder;
    signal tieAndNotDealer1 <== isTie.out * (1 - dealerIs1.out);
    signal tieOddP2 <== tieAndNotDealer1 * remainder;

    signal p1Share <== p1WinShare + tieShareP1Base + tieOddP1;
    signal p2WinShare <== p2Wins.out * pot;
    signal tieShareP2Base <== isTie.out * halfPot;
    signal p2Share <== p2WinShare + tieShareP2Base + tieOddP2;

    // Final stacks
    signal finalStackP1 <== stackP1Before + p1Share;
    signal finalStackP2 <== stackP2Before + p2Share;

    // === Verify state after commitment ===
    component commitAfter = GameStateCommitment();
    commitAfter.stackP1 <== finalStackP1;
    commitAfter.stackP2 <== finalStackP2;
    commitAfter.pot <== 0;  // Pot distributed
    commitAfter.street <== 4;  // Still showdown
    commitAfter.currentPlayer <== 0;  // Game over
    commitAfter.lastAction <== 0;
    commitAfter.lastBetSize <== 0;
    commitAfter.streetBetP1 <== 0;
    commitAfter.streetBetP2 <== 0;
    commitAfter.status <== 2;  // FINISHED
    commitAfter.dealer <== dealer;
    commitAfter.out === stateAfterCommitment;
}

component main {public [stateBeforeCommitment, stateAfterCommitment, merkleRoot, p1HoleCommitment, p2HoleCommitment, boardCommitment]} = Showdown();
