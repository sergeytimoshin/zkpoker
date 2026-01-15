pragma circom 2.1.0;

// Hand Evaluation Circuit
// Proves that a player's poker hand was correctly evaluated

include "card_commitment.circom";
include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/mux1.circom";

// Constants for card encoding
// Rank primes: 2=2, 3=3, 4=5, 5=7, 6=11, 7=13, 8=17, 9=19, T=23, J=29, Q=31, K=37, A=41

template HandEval() {
    // === Public inputs ===
    signal input merkleRoot;  // Root of hand rankings lookup table
    signal input holeCardsCommitment;  // Commitment to hole cards
    signal input boardCardsCommitment;  // Commitment to board cards
    signal input handRank;  // Claimed hand rank (0 = best, 7461 = worst)

    // === Private inputs ===
    // Hole cards (indices 0-51)
    signal input holeCard0;
    signal input holeCard1;

    // Board cards (indices 0-51)
    signal input boardCard0;
    signal input boardCard1;
    signal input boardCard2;
    signal input boardCard3;
    signal input boardCard4;

    // Which 5 cards form the best hand
    signal input useHole0;
    signal input useHole1;
    signal input useBoard0;
    signal input useBoard1;
    signal input useBoard2;
    signal input useBoard3;
    signal input useBoard4;

    // Is this hand a flush?
    signal input isFlush;

    // Merkle proof (13 levels for 7462 hands)
    signal input merkleProof[13];
    signal input merklePathBits[13];

    // Lookup key (product of rank primes for the 5 cards)
    signal input lookupKey;

    // === Verify hole cards commitment ===
    component holeCommit = Poseidon(2);
    holeCommit.inputs[0] <== holeCard0;
    holeCommit.inputs[1] <== holeCard1;
    holeCommit.out === holeCardsCommitment;

    // === Verify board cards commitment ===
    component boardCommit = Poseidon(5);
    boardCommit.inputs[0] <== boardCard0;
    boardCommit.inputs[1] <== boardCard1;
    boardCommit.inputs[2] <== boardCard2;
    boardCommit.inputs[3] <== boardCard3;
    boardCommit.inputs[4] <== boardCard4;
    boardCommit.out === boardCardsCommitment;

    // === Verify exactly 5 cards selected ===
    signal cardCount <== useHole0 + useHole1 + useBoard0 + useBoard1 + useBoard2 + useBoard3 + useBoard4;
    cardCount === 5;

    // === Verify Merkle proof ===
    // Leaf = Poseidon(lookupKey, handRank, isFlush)
    component leaf = Poseidon(3);
    leaf.inputs[0] <== lookupKey;
    leaf.inputs[1] <== handRank;
    leaf.inputs[2] <== isFlush;

    component merkle = MerkleProof(13);
    merkle.leaf <== leaf.out;
    for (var i = 0; i < 13; i++) {
        merkle.pathElements[i] <== merkleProof[i];
        merkle.pathIndices[i] <== merklePathBits[i];
    }
    merkle.root === merkleRoot;
}

component main {public [merkleRoot, holeCardsCommitment, boardCardsCommitment, handRank]} = HandEval();
