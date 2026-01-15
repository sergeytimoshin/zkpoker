pragma circom 2.1.0;

// ElGamal Encryption for Mental Poker using BabyJubJub curve
// Implements mask/unmask operations for commutative card encryption

include "circomlib/circuits/babyjub.circom";
include "circomlib/circuits/escalarmulany.circom";
include "circomlib/circuits/escalarmulfix.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/mux1.circom";
include "circomlib/circuits/bitify.circom";

// BabyJubJub Generator (from circomlib)
// Base8 = (5299619240641551281634865583518297030282874472190772894086521144482721001553,
//          16950150798460657717958625567821834550301663161624707787222815936182638968203)

// Card structure in signals: (epk_x, epk_y, msg_x, msg_y, pk_x, pk_y)
// epk = ephemeral public key (from masking nonces)
// msg = card value point (masked or unmasked)
// pk = joint public key of all masking players

// Compute public key from secret: pubKey = secret * G
template SecretToPublicKey() {
    signal input secret;
    signal output pubX;
    signal output pubY;

    component secretBits = Num2Bits(253);
    secretBits.in <== secret;

    component mulFix = EscalarMulFix(253, [
        5299619240641551281634865583518297030282874472190772894086521144482721001553,
        16950150798460657717958625567821834550301663161624707787222815936182638968203
    ]);

    for (var i = 0; i < 253; i++) {
        mulFix.e[i] <== secretBits.out[i];
    }

    pubX <== mulFix.out[0];
    pubY <== mulFix.out[1];
}

// Point addition with conditional for infinity handling
// If isInf1=1, return P2; if isInf2=1, return P1
template BabyAddWithInf() {
    signal input x1;
    signal input y1;
    signal input isInf1;
    signal input x2;
    signal input y2;
    signal input isInf2;
    signal output outX;
    signal output outY;
    signal output outIsInf;

    // Check if result would be infinity (P + (-P) = O)
    // On BabyJubJub, -P = (-x, y), so P + (-P) when x1 = -x2 and y1 = y2
    signal negX2 <== -x2;
    component sameY = IsEqual();
    sameY.in[0] <== y1;
    sameY.in[1] <== y2;
    component oppX = IsEqual();
    oppX.in[0] <== x1;
    oppX.in[1] <== negX2;
    signal wouldCancel <== sameY.out * oppX.out;

    // Standard BabyJubJub addition
    component add = BabyAdd();
    add.x1 <== x1;
    add.y1 <== y1;
    add.x2 <== x2;
    add.y2 <== y2;

    // Select based on infinity flags
    // If isInf1, use P2
    component muxInf1X = Mux1();
    component muxInf1Y = Mux1();
    muxInf1X.c[0] <== add.xout;
    muxInf1X.c[1] <== x2;
    muxInf1X.s <== isInf1;
    muxInf1Y.c[0] <== add.yout;
    muxInf1Y.c[1] <== y2;
    muxInf1Y.s <== isInf1;

    // If isInf2, use P1
    component muxInf2X = Mux1();
    component muxInf2Y = Mux1();
    muxInf2X.c[0] <== muxInf1X.out;
    muxInf2X.c[1] <== x1;
    muxInf2X.s <== isInf2;
    muxInf2Y.c[0] <== muxInf1Y.out;
    muxInf2Y.c[1] <== y1;
    muxInf2Y.s <== isInf2;

    outX <== muxInf2X.out;
    outY <== muxInf2Y.out;

    // Output is infinity if both inputs infinite OR would cancel
    signal bothInf <== isInf1 * isInf2;
    signal neitherInf <== (1 - isInf1) * (1 - isInf2);
    signal cancelCase <== wouldCancel * neitherInf;
    outIsInf <== bothInf + cancelCase - bothInf * cancelCase;
}

// Point subtraction: P1 - P2 = P1 + (-P2)
// On BabyJubJub (twisted Edwards), -P = (-x, y)
template BabySubWithInf() {
    signal input x1;
    signal input y1;
    signal input isInf1;
    signal input x2;
    signal input y2;
    signal input isInf2;
    signal output outX;
    signal output outY;
    signal output outIsInf;

    // Negate P2: -P2 = (-x2, y2)
    signal negX2 <== -x2;

    component add = BabyAddWithInf();
    add.x1 <== x1;
    add.y1 <== y1;
    add.isInf1 <== isInf1;
    add.x2 <== negX2;
    add.y2 <== y2;
    add.isInf2 <== isInf2;

    outX <== add.outX;
    outY <== add.outY;
    outIsInf <== add.outIsInf;
}

// Scalar multiplication with any point
template ScalarMulAnyWithInf() {
    signal input px;
    signal input py;
    signal input isInf;
    signal input scalar;
    signal output outX;
    signal output outY;
    signal output outIsInf;

    // If input is infinity, output is infinity regardless of scalar
    component scalarBits = Num2Bits(253);
    scalarBits.in <== scalar;

    component mul = EscalarMulAny(253);
    mul.p[0] <== px;
    mul.p[1] <== py;
    for (var i = 0; i < 253; i++) {
        mul.e[i] <== scalarBits.out[i];
    }

    // If input was infinity, output infinity; else use mul result
    component muxX = Mux1();
    component muxY = Mux1();
    muxX.c[0] <== mul.out[0];
    muxX.c[1] <== 0;
    muxX.s <== isInf;
    muxY.c[0] <== mul.out[1];
    muxY.c[1] <== 1;  // Identity point on BabyJubJub is (0, 1)
    muxY.s <== isInf;

    outX <== muxX.out;
    outY <== muxY.out;
    outIsInf <== isInf;
}

// Add player to card mask group
// pk_new = pk + G * player_secret
// If epk exists, msg_new = msg + epk * player_secret
template AddPlayerToCardMask() {
    signal input epkX;
    signal input epkY;
    signal input epkIsInf;
    signal input msgX;
    signal input msgY;
    signal input pkX;
    signal input pkY;
    signal input pkIsInf;
    signal input playerSecret;

    signal output outEpkX;
    signal output outEpkY;
    signal output outEpkIsInf;
    signal output outMsgX;
    signal output outMsgY;
    signal output outPkX;
    signal output outPkY;
    signal output outPkIsInf;

    // Compute player's public key
    component playerPub = SecretToPublicKey();
    playerPub.secret <== playerSecret;

    // New pk = old_pk + player_pub
    component addPk = BabyAddWithInf();
    addPk.x1 <== pkX;
    addPk.y1 <== pkY;
    addPk.isInf1 <== pkIsInf;
    addPk.x2 <== playerPub.pubX;
    addPk.y2 <== playerPub.pubY;
    addPk.isInf2 <== 0;

    outPkX <== addPk.outX;
    outPkY <== addPk.outY;
    outPkIsInf <== addPk.outIsInf;

    // If epk exists and not first player, msg_new = msg + epk * player_secret
    component epkScaled = ScalarMulAnyWithInf();
    epkScaled.px <== epkX;
    epkScaled.py <== epkY;
    epkScaled.isInf <== epkIsInf;
    epkScaled.scalar <== playerSecret;

    // Only add if epk is not infinity (not first player)
    component addMsg = BabyAddWithInf();
    addMsg.x1 <== msgX;
    addMsg.y1 <== msgY;
    addMsg.isInf1 <== 0;  // msg is never infinity
    addMsg.x2 <== epkScaled.outX;
    addMsg.y2 <== epkScaled.outY;
    addMsg.isInf2 <== epkIsInf;  // If epk was infinity, adding it does nothing

    outMsgX <== addMsg.outX;
    outMsgY <== addMsg.outY;

    // epk unchanged
    outEpkX <== epkX;
    outEpkY <== epkY;
    outEpkIsInf <== epkIsInf;
}

// Mask a card with a random nonce
// epk_new = epk + G * nonce
// msg_new = msg + pk * nonce
template MaskCard() {
    signal input epkX;
    signal input epkY;
    signal input epkIsInf;
    signal input msgX;
    signal input msgY;
    signal input pkX;
    signal input pkY;
    signal input pkIsInf;
    signal input nonce;

    signal output outEpkX;
    signal output outEpkY;
    signal output outEpkIsInf;
    signal output outMsgX;
    signal output outMsgY;
    signal output outPkX;
    signal output outPkY;

    // Require pk is not infinity (at least one player in mask group)
    pkIsInf === 0;

    // ephemeral_pub = G * nonce
    component ephemeralPub = SecretToPublicKey();
    ephemeralPub.secret <== nonce;

    // new_epk = epk + ephemeral_pub
    component addEpk = BabyAddWithInf();
    addEpk.x1 <== epkX;
    addEpk.y1 <== epkY;
    addEpk.isInf1 <== epkIsInf;
    addEpk.x2 <== ephemeralPub.pubX;
    addEpk.y2 <== ephemeralPub.pubY;
    addEpk.isInf2 <== 0;

    outEpkX <== addEpk.outX;
    outEpkY <== addEpk.outY;
    outEpkIsInf <== 0;  // After masking, epk is never infinity

    // shared_secret = pk * nonce
    component sharedSecret = ScalarMulAnyWithInf();
    sharedSecret.px <== pkX;
    sharedSecret.py <== pkY;
    sharedSecret.isInf <== 0;  // pk is not infinity (checked above)
    sharedSecret.scalar <== nonce;

    // new_msg = msg + shared_secret
    component addMsg = BabyAdd();
    addMsg.x1 <== msgX;
    addMsg.y1 <== msgY;
    addMsg.x2 <== sharedSecret.outX;
    addMsg.y2 <== sharedSecret.outY;

    outMsgX <== addMsg.xout;
    outMsgY <== addMsg.yout;

    // pk unchanged
    outPkX <== pkX;
    outPkY <== pkY;
}

// Combined: add player and mask in one step (used in shuffle)
template AddPlayerAndMask() {
    signal input epkX;
    signal input epkY;
    signal input epkIsInf;
    signal input msgX;
    signal input msgY;
    signal input pkX;
    signal input pkY;
    signal input pkIsInf;
    signal input playerSecret;
    signal input nonce;

    signal output outEpkX;
    signal output outEpkY;
    signal output outMsgX;
    signal output outMsgY;
    signal output outPkX;
    signal output outPkY;

    // First add player
    component addPlayer = AddPlayerToCardMask();
    addPlayer.epkX <== epkX;
    addPlayer.epkY <== epkY;
    addPlayer.epkIsInf <== epkIsInf;
    addPlayer.msgX <== msgX;
    addPlayer.msgY <== msgY;
    addPlayer.pkX <== pkX;
    addPlayer.pkY <== pkY;
    addPlayer.pkIsInf <== pkIsInf;
    addPlayer.playerSecret <== playerSecret;

    // Then mask
    component mask = MaskCard();
    mask.epkX <== addPlayer.outEpkX;
    mask.epkY <== addPlayer.outEpkY;
    mask.epkIsInf <== addPlayer.outEpkIsInf;
    mask.msgX <== addPlayer.outMsgX;
    mask.msgY <== addPlayer.outMsgY;
    mask.pkX <== addPlayer.outPkX;
    mask.pkY <== addPlayer.outPkY;
    mask.pkIsInf <== addPlayer.outPkIsInf;
    mask.nonce <== nonce;

    outEpkX <== mask.outEpkX;
    outEpkY <== mask.outEpkY;
    outMsgX <== mask.outMsgX;
    outMsgY <== mask.outMsgY;
    outPkX <== mask.outPkX;
    outPkY <== mask.outPkY;
}

// Partial unmask (one player reveals their share)
// decryption_share = epk * player_secret
// msg_new = msg - decryption_share
// pk_new = pk - player_pub
template PartialUnmask() {
    signal input epkX;
    signal input epkY;
    signal input msgX;
    signal input msgY;
    signal input pkX;
    signal input pkY;
    signal input playerSecret;

    signal output outMsgX;
    signal output outMsgY;
    signal output outMsgIsInf;
    signal output outPkX;
    signal output outPkY;
    signal output outPkIsInf;

    // Compute player's public key
    component playerPub = SecretToPublicKey();
    playerPub.secret <== playerSecret;

    // decryption_share = epk * player_secret
    component decShare = ScalarMulAnyWithInf();
    decShare.px <== epkX;
    decShare.py <== epkY;
    decShare.isInf <== 0;
    decShare.scalar <== playerSecret;

    // new_msg = msg - decryption_share
    component subMsg = BabySubWithInf();
    subMsg.x1 <== msgX;
    subMsg.y1 <== msgY;
    subMsg.isInf1 <== 0;
    subMsg.x2 <== decShare.outX;
    subMsg.y2 <== decShare.outY;
    subMsg.isInf2 <== 0;

    outMsgX <== subMsg.outX;
    outMsgY <== subMsg.outY;
    outMsgIsInf <== subMsg.outIsInf;

    // new_pk = pk - player_pub
    component subPk = BabySubWithInf();
    subPk.x1 <== pkX;
    subPk.y1 <== pkY;
    subPk.isInf1 <== 0;
    subPk.x2 <== playerPub.pubX;
    subPk.y2 <== playerPub.pubY;
    subPk.isInf2 <== 0;

    outPkX <== subPk.outX;
    outPkY <== subPk.outY;
    outPkIsInf <== subPk.outIsInf;
}
