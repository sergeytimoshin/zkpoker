pragma circom 2.1.0;

// Re-shuffle Circuit for Player 2+
// Takes an already-masked deck and applies additional shuffle + masking

include "elgamal.circom";
include "card_commitment.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/poseidon.circom";

// Verify permutation is valid (each index 0..n-1 appears exactly once)
template VerifyPermutation(n) {
    signal input perm[n];
    signal output valid;

    component isIdx[n][n];
    signal partialCount[n][n+1];
    signal counts[n];

    for (var i = 0; i < n; i++) {
        partialCount[i][0] <== 0;
        for (var j = 0; j < n; j++) {
            isIdx[i][j] = IsEqual();
            isIdx[i][j].in[0] <== perm[j];
            isIdx[i][j].in[1] <== i;
            partialCount[i][j+1] <== partialCount[i][j] + isIdx[i][j].out;
        }
        counts[i] <== partialCount[i][n];
    }

    component isOne[n];
    signal allOne[n+1];
    allOne[0] <== 1;
    for (var i = 0; i < n; i++) {
        isOne[i] = IsEqual();
        isOne[i].in[0] <== counts[i];
        isOne[i].in[1] <== 1;
        allOne[i+1] <== allOne[i] * isOne[i].out;
    }

    valid <== allOne[n];
}

// Select one of n values based on selector index
template Selector(n) {
    signal input values[n];
    signal input index;
    signal output out;

    component isIdx[n];
    signal partial[n+1];
    partial[0] <== 0;

    for (var i = 0; i < n; i++) {
        isIdx[i] = IsEqual();
        isIdx[i].in[0] <== index;
        isIdx[i].in[1] <== i;
        partial[i+1] <== partial[i] + isIdx[i].out * values[i];
    }

    out <== partial[n];
}

// Re-shuffle already-masked deck
template Reshuffle() {
    // === Public inputs ===
    signal input deckCommitmentBefore;
    signal input deckCommitmentAfter;
    signal input playerPubX;
    signal input playerPubY;

    // === Private inputs ===
    // Cards before: already masked (epk.x, epk.y, msg.x, msg.y, pk.x, pk.y)
    signal input cardsBefore[52][6];

    // Cards after: re-masked
    signal input cardsAfter[52][6];

    // Permutation: position i contains the original index
    signal input permutation[52];

    // Player's secret key
    signal input playerSecret;

    // Nonces for additional masking
    signal input nonces[52];

    // === Verify player's public key ===
    component computedPub = SecretToPublicKey();
    computedPub.secret <== playerSecret;
    computedPub.pubX === playerPubX;
    computedPub.pubY === playerPubY;

    // === Verify permutation is valid ===
    component verifyPerm = VerifyPermutation(52);
    for (var i = 0; i < 52; i++) {
        verifyPerm.perm[i] <== permutation[i];
    }
    verifyPerm.valid === 1;

    // === Compute deck commitment before ===
    component beforeHash[52];
    signal productBefore[53];
    productBefore[0] <== 1;

    for (var i = 0; i < 52; i++) {
        beforeHash[i] = Poseidon(6);
        beforeHash[i].inputs[0] <== cardsBefore[i][0];  // epk.x
        beforeHash[i].inputs[1] <== cardsBefore[i][1];  // epk.y
        beforeHash[i].inputs[2] <== cardsBefore[i][2];  // msg.x
        beforeHash[i].inputs[3] <== cardsBefore[i][3];  // msg.y
        beforeHash[i].inputs[4] <== cardsBefore[i][4];  // pk.x
        beforeHash[i].inputs[5] <== cardsBefore[i][5];  // pk.y
        productBefore[i+1] <== productBefore[i] * (beforeHash[i].out + 1);
    }
    productBefore[52] === deckCommitmentBefore;

    // === Pre-extract values for selection ===
    signal epkXValues[52];
    signal epkYValues[52];
    signal msgXValues[52];
    signal msgYValues[52];
    signal pkXValues[52];
    signal pkYValues[52];

    for (var j = 0; j < 52; j++) {
        epkXValues[j] <== cardsBefore[j][0];
        epkYValues[j] <== cardsBefore[j][1];
        msgXValues[j] <== cardsBefore[j][2];
        msgYValues[j] <== cardsBefore[j][3];
        pkXValues[j] <== cardsBefore[j][4];
        pkYValues[j] <== cardsBefore[j][5];
    }

    // === Verify each card re-shuffled and re-masked correctly ===
    component selectEpkX[52];
    component selectEpkY[52];
    component selectMsgX[52];
    component selectMsgY[52];
    component selectPkX[52];
    component selectPkY[52];
    component maskOps[52];
    component afterHash[52];
    signal productAfter[53];
    productAfter[0] <== 1;

    for (var i = 0; i < 52; i++) {
        // Select original card based on permutation[i]
        selectEpkX[i] = Selector(52);
        selectEpkY[i] = Selector(52);
        selectMsgX[i] = Selector(52);
        selectMsgY[i] = Selector(52);
        selectPkX[i] = Selector(52);
        selectPkY[i] = Selector(52);

        for (var j = 0; j < 52; j++) {
            selectEpkX[i].values[j] <== epkXValues[j];
            selectEpkY[i].values[j] <== epkYValues[j];
            selectMsgX[i].values[j] <== msgXValues[j];
            selectMsgY[i].values[j] <== msgYValues[j];
            selectPkX[i].values[j] <== pkXValues[j];
            selectPkY[i].values[j] <== pkYValues[j];
        }
        selectEpkX[i].index <== permutation[i];
        selectEpkY[i].index <== permutation[i];
        selectMsgX[i].index <== permutation[i];
        selectMsgY[i].index <== permutation[i];
        selectPkX[i].index <== permutation[i];
        selectPkY[i].index <== permutation[i];

        // Apply additional masking to the selected card
        // Card already has epk and pk, so we add to them
        maskOps[i] = AddPlayerAndMask();
        maskOps[i].epkX <== selectEpkX[i].out;
        maskOps[i].epkY <== selectEpkY[i].out;
        maskOps[i].epkIsInf <== 0;  // epk is NOT infinity (already masked)
        maskOps[i].msgX <== selectMsgX[i].out;
        maskOps[i].msgY <== selectMsgY[i].out;
        maskOps[i].pkX <== selectPkX[i].out;
        maskOps[i].pkY <== selectPkY[i].out;
        maskOps[i].pkIsInf <== 0;   // pk is NOT infinity (already has player keys)
        maskOps[i].playerSecret <== playerSecret;
        maskOps[i].nonce <== nonces[i];

        // Verify masked card matches provided output
        maskOps[i].outEpkX === cardsAfter[i][0];
        maskOps[i].outEpkY === cardsAfter[i][1];
        maskOps[i].outMsgX === cardsAfter[i][2];
        maskOps[i].outMsgY === cardsAfter[i][3];
        maskOps[i].outPkX === cardsAfter[i][4];
        maskOps[i].outPkY === cardsAfter[i][5];

        // Add to after commitment
        afterHash[i] = Poseidon(6);
        afterHash[i].inputs[0] <== cardsAfter[i][0];
        afterHash[i].inputs[1] <== cardsAfter[i][1];
        afterHash[i].inputs[2] <== cardsAfter[i][2];
        afterHash[i].inputs[3] <== cardsAfter[i][3];
        afterHash[i].inputs[4] <== cardsAfter[i][4];
        afterHash[i].inputs[5] <== cardsAfter[i][5];
        productAfter[i+1] <== productAfter[i] * (afterHash[i].out + 1);
    }

    productAfter[52] === deckCommitmentAfter;
}

component main {public [deckCommitmentBefore, deckCommitmentAfter, playerPubX, playerPubY]} = Reshuffle();
