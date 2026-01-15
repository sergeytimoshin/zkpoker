pragma circom 2.1.0;

// Card Unmasking Circuit (Poseidon version)
// Proves that a card was correctly partially unmasked by a player

include "elgamal.circom";
include "card_commitment.circom";
include "circomlib/circuits/comparators.circom";

template CardUnmask() {
    // === Public inputs ===
    signal input inputCardCommitment;
    signal input outputCardCommitment;
    signal input playerPubX;
    signal input playerPubY;

    // === Private inputs ===
    signal input inputEpkX;
    signal input inputEpkY;
    signal input inputMsgX;
    signal input inputMsgY;
    signal input inputPkX;
    signal input inputPkY;
    signal input playerSecret;

    // === Verify player's public key matches their secret ===
    component computedPub = SecretToPublicKey();
    computedPub.secret <== playerSecret;
    computedPub.pubX === playerPubX;
    computedPub.pubY === playerPubY;

    // === Verify input card commitment ===
    component inputCommit = CardCommitment();
    inputCommit.epkX <== inputEpkX;
    inputCommit.epkY <== inputEpkY;
    inputCommit.epkIsInf <== 0;  // Masked card has epk
    inputCommit.msgX <== inputMsgX;
    inputCommit.msgY <== inputMsgY;
    inputCommit.msgIsInf <== 0;
    inputCommit.pkX <== inputPkX;
    inputCommit.pkY <== inputPkY;
    inputCommit.pkIsInf <== 0;  // Masked card has pk
    inputCommit.out === inputCardCommitment;

    // === Apply partial unmask operation ===
    component unmaskOp = PartialUnmask();
    unmaskOp.epkX <== inputEpkX;
    unmaskOp.epkY <== inputEpkY;
    unmaskOp.msgX <== inputMsgX;
    unmaskOp.msgY <== inputMsgY;
    unmaskOp.pkX <== inputPkX;
    unmaskOp.pkY <== inputPkY;
    unmaskOp.playerSecret <== playerSecret;

    // === Verify output card commitment ===
    component outputCommit = CardCommitment();
    outputCommit.epkX <== inputEpkX;  // epk unchanged
    outputCommit.epkY <== inputEpkY;
    outputCommit.epkIsInf <== 0;
    outputCommit.msgX <== unmaskOp.outMsgX;
    outputCommit.msgY <== unmaskOp.outMsgY;
    outputCommit.msgIsInf <== unmaskOp.outMsgIsInf;
    outputCommit.pkX <== unmaskOp.outPkX;
    outputCommit.pkY <== unmaskOp.outPkY;
    outputCommit.pkIsInf <== unmaskOp.outPkIsInf;
    outputCommit.out === outputCardCommitment;
}

component main {public [inputCardCommitment, outputCardCommitment, playerPubX, playerPubY]} = CardUnmask();
