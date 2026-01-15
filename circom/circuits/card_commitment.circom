pragma circom 2.1.0;

// Card commitment using Poseidon hash
// Commitment = Poseidon(epk.x, epk.y, msg.x, msg.y, pk.x, pk.y)

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/mux1.circom";

// Card commitment: 6 field elements -> 1 hash
template CardCommitment() {
    signal input epkX;
    signal input epkY;
    signal input epkIsInf;
    signal input msgX;
    signal input msgY;
    signal input msgIsInf;
    signal input pkX;
    signal input pkY;
    signal input pkIsInf;
    signal output out;

    // For infinity points, use (0, 0)
    component muxEpkX = Mux1();
    component muxEpkY = Mux1();
    muxEpkX.c[0] <== epkX;
    muxEpkX.c[1] <== 0;
    muxEpkX.s <== epkIsInf;
    muxEpkY.c[0] <== epkY;
    muxEpkY.c[1] <== 0;
    muxEpkY.s <== epkIsInf;

    component muxMsgX = Mux1();
    component muxMsgY = Mux1();
    muxMsgX.c[0] <== msgX;
    muxMsgX.c[1] <== 0;
    muxMsgX.s <== msgIsInf;
    muxMsgY.c[0] <== msgY;
    muxMsgY.c[1] <== 0;
    muxMsgY.s <== msgIsInf;

    component muxPkX = Mux1();
    component muxPkY = Mux1();
    muxPkX.c[0] <== pkX;
    muxPkX.c[1] <== 0;
    muxPkX.s <== pkIsInf;
    muxPkY.c[0] <== pkY;
    muxPkY.c[1] <== 0;
    muxPkY.s <== pkIsInf;

    component hash = Poseidon(6);
    hash.inputs[0] <== muxEpkX.out;
    hash.inputs[1] <== muxEpkY.out;
    hash.inputs[2] <== muxMsgX.out;
    hash.inputs[3] <== muxMsgY.out;
    hash.inputs[4] <== muxPkX.out;
    hash.inputs[5] <== muxPkY.out;

    out <== hash.out;
}

// Game state commitment: 11 field elements -> 1 hash
template GameStateCommitment() {
    signal input stackP1;
    signal input stackP2;
    signal input pot;
    signal input street;
    signal input currentPlayer;
    signal input lastAction;
    signal input lastBetSize;
    signal input streetBetP1;
    signal input streetBetP2;
    signal input status;
    signal input dealer;
    signal output out;

    // Poseidon can handle up to 16 inputs efficiently
    component hash = Poseidon(11);
    hash.inputs[0] <== stackP1;
    hash.inputs[1] <== stackP2;
    hash.inputs[2] <== pot;
    hash.inputs[3] <== street;
    hash.inputs[4] <== currentPlayer;
    hash.inputs[5] <== lastAction;
    hash.inputs[6] <== lastBetSize;
    hash.inputs[7] <== streetBetP1;
    hash.inputs[8] <== streetBetP2;
    hash.inputs[9] <== status;
    hash.inputs[10] <== dealer;

    out <== hash.out;
}

// Deck commitment: product of (card_hash + 1) for all 52 cards
// This preserves order-independence while being collision-resistant
template DeckCommitment() {
    signal input cards[52][6];  // 52 cards, each with 6 fields (epk.x, epk.y, msg.x, msg.y, pk.x, pk.y)
    signal output out;

    component cardHash[52];
    signal product[53];
    product[0] <== 1;

    for (var i = 0; i < 52; i++) {
        cardHash[i] = Poseidon(6);
        for (var j = 0; j < 6; j++) {
            cardHash[i].inputs[j] <== cards[i][j];
        }
        product[i + 1] <== product[i] * (cardHash[i].out + 1);
    }

    out <== product[52];
}

// Merkle tree verification using Poseidon
template MerkleProof(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    signal output root;

    signal hashes[levels + 1];
    hashes[0] <== leaf;

    component hashers[levels];
    component muxLeft[levels];
    component muxRight[levels];

    for (var i = 0; i < levels; i++) {
        // Select order based on path index
        muxLeft[i] = Mux1();
        muxLeft[i].c[0] <== hashes[i];
        muxLeft[i].c[1] <== pathElements[i];
        muxLeft[i].s <== pathIndices[i];

        muxRight[i] = Mux1();
        muxRight[i].c[0] <== pathElements[i];
        muxRight[i].c[1] <== hashes[i];
        muxRight[i].s <== pathIndices[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== muxLeft[i].out;
        hashers[i].inputs[1] <== muxRight[i].out;

        hashes[i + 1] <== hashers[i].out;
    }

    root <== hashes[levels];
}
