pragma circom 2.1.0;

// Card Masking Circuit (Poseidon version)
// Proves that a card was correctly masked by a player using ElGamal encryption

include "elgamal.circom";
include "card_commitment.circom";
include "circomlib/circuits/comparators.circom";

template CardMask() {
    // === Public inputs ===
    signal input inputCardCommitment;
    signal input outputCardCommitment;
    signal input playerPubX;
    signal input playerPubY;

    // === Private inputs ===
    signal input inputEpkX;
    signal input inputEpkY;
    signal input inputEpkIsInf;
    signal input inputMsgX;
    signal input inputMsgY;
    signal input inputPkX;
    signal input inputPkY;
    signal input inputPkIsInf;
    signal input playerSecret;
    signal input nonce;

    // === Verify player's public key matches their secret ===
    component computedPub = SecretToPublicKey();
    computedPub.secret <== playerSecret;
    computedPub.pubX === playerPubX;
    computedPub.pubY === playerPubY;

    // === Verify input card commitment ===
    component inputCommit = CardCommitment();
    inputCommit.epkX <== inputEpkX;
    inputCommit.epkY <== inputEpkY;
    inputCommit.epkIsInf <== inputEpkIsInf;
    inputCommit.msgX <== inputMsgX;
    inputCommit.msgY <== inputMsgY;
    inputCommit.msgIsInf <== 0;  // msg never infinity
    inputCommit.pkX <== inputPkX;
    inputCommit.pkY <== inputPkY;
    inputCommit.pkIsInf <== inputPkIsInf;
    inputCommit.out === inputCardCommitment;

    // === Apply masking operations ===
    component maskOp = AddPlayerAndMask();
    maskOp.epkX <== inputEpkX;
    maskOp.epkY <== inputEpkY;
    maskOp.epkIsInf <== inputEpkIsInf;
    maskOp.msgX <== inputMsgX;
    maskOp.msgY <== inputMsgY;
    maskOp.pkX <== inputPkX;
    maskOp.pkY <== inputPkY;
    maskOp.pkIsInf <== inputPkIsInf;
    maskOp.playerSecret <== playerSecret;
    maskOp.nonce <== nonce;

    // === Verify output card commitment ===
    component outputCommit = CardCommitment();
    outputCommit.epkX <== maskOp.outEpkX;
    outputCommit.epkY <== maskOp.outEpkY;
    outputCommit.epkIsInf <== 0;  // After masking, epk not infinity
    outputCommit.msgX <== maskOp.outMsgX;
    outputCommit.msgY <== maskOp.outMsgY;
    outputCommit.msgIsInf <== 0;
    outputCommit.pkX <== maskOp.outPkX;
    outputCommit.pkY <== maskOp.outPkY;
    outputCommit.pkIsInf <== 0;  // After masking, pk not infinity
    outputCommit.out === outputCardCommitment;
}

component main {public [inputCardCommitment, outputCardCommitment, playerPubX, playerPubY]} = CardMask();
