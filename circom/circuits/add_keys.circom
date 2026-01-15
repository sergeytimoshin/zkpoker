pragma circom 2.1.0;

// Add Player Keys Circuit
// Adds a player's key to all cards in the deck without shuffling
// Used for simpler protocols or when shuffle is handled separately

include "elgamal.circom";
include "card_commitment.circom";
include "circomlib/circuits/poseidon.circom";

// Add keys to a single card (no shuffle, no re-encryption of msg)
// Just updates: pk_new = pk + player_pub
template AddKeyToCard() {
    // Input card
    signal input epkX;
    signal input epkY;
    signal input msgX;
    signal input msgY;
    signal input pkX;
    signal input pkY;
    signal input pkIsInf;

    // Player's secret
    signal input playerSecret;

    // Output card
    signal output outEpkX;
    signal output outEpkY;
    signal output outMsgX;
    signal output outMsgY;
    signal output outPkX;
    signal output outPkY;

    // Compute player's public key
    component playerPub = SecretToPublicKey();
    playerPub.secret <== playerSecret;

    // pk_new = pk + player_pub
    component addPk = BabyAddWithInf();
    addPk.x1 <== pkX;
    addPk.y1 <== pkY;
    addPk.isInf1 <== pkIsInf;
    addPk.x2 <== playerPub.pubX;
    addPk.y2 <== playerPub.pubY;
    addPk.isInf2 <== 0;

    // Output: epk and msg unchanged, only pk updated
    outEpkX <== epkX;
    outEpkY <== epkY;
    outMsgX <== msgX;
    outMsgY <== msgY;
    outPkX <== addPk.outX;
    outPkY <== addPk.outY;
}

// Add keys to entire deck (52 cards)
template AddKeysToDeck() {
    // === Public inputs ===
    signal input deckCommitmentBefore;
    signal input deckCommitmentAfter;
    signal input playerPubX;
    signal input playerPubY;

    // === Private inputs ===
    // Cards before
    signal input cardsBefore[52][6];  // epk.x, epk.y, msg.x, msg.y, pk.x, pk.y
    signal input pkIsInfBefore[52];   // Whether pk was infinity for each card

    // Cards after
    signal input cardsAfter[52][6];

    // Player's secret
    signal input playerSecret;

    // === Verify player's public key ===
    component computedPub = SecretToPublicKey();
    computedPub.secret <== playerSecret;
    computedPub.pubX === playerPubX;
    computedPub.pubY === playerPubY;

    // === Compute deck commitment before ===
    component beforeHash[52];
    signal productBefore[53];
    productBefore[0] <== 1;

    for (var i = 0; i < 52; i++) {
        beforeHash[i] = Poseidon(6);
        beforeHash[i].inputs[0] <== cardsBefore[i][0];
        beforeHash[i].inputs[1] <== cardsBefore[i][1];
        beforeHash[i].inputs[2] <== cardsBefore[i][2];
        beforeHash[i].inputs[3] <== cardsBefore[i][3];
        beforeHash[i].inputs[4] <== cardsBefore[i][4];
        beforeHash[i].inputs[5] <== cardsBefore[i][5];
        productBefore[i+1] <== productBefore[i] * (beforeHash[i].out + 1);
    }
    productBefore[52] === deckCommitmentBefore;

    // === Add keys to each card ===
    component addKey[52];
    component afterHash[52];
    signal productAfter[53];
    productAfter[0] <== 1;

    for (var i = 0; i < 52; i++) {
        addKey[i] = AddKeyToCard();
        addKey[i].epkX <== cardsBefore[i][0];
        addKey[i].epkY <== cardsBefore[i][1];
        addKey[i].msgX <== cardsBefore[i][2];
        addKey[i].msgY <== cardsBefore[i][3];
        addKey[i].pkX <== cardsBefore[i][4];
        addKey[i].pkY <== cardsBefore[i][5];
        addKey[i].pkIsInf <== pkIsInfBefore[i];
        addKey[i].playerSecret <== playerSecret;

        // Verify output matches
        addKey[i].outEpkX === cardsAfter[i][0];
        addKey[i].outEpkY === cardsAfter[i][1];
        addKey[i].outMsgX === cardsAfter[i][2];
        addKey[i].outMsgY === cardsAfter[i][3];
        addKey[i].outPkX === cardsAfter[i][4];
        addKey[i].outPkY === cardsAfter[i][5];

        // Compute after commitment
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

component main {public [deckCommitmentBefore, deckCommitmentAfter, playerPubX, playerPubY]} = AddKeysToDeck();
