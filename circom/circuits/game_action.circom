pragma circom 2.1.0;

// Game Action Circuit (Poseidon version)
// Proves that a game action is valid and correctly transitions the state

include "card_commitment.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/mux1.circom";
include "circomlib/circuits/gates.circom";

// Action type constants: NULL=0, BET=1, CALL=2, FOLD=3, RAISE=4, CHECK=5, ALL_IN=6
// Status constants: WAITING=0, ACTIVE=1, FINISHED=2

// Validate that an action is legal given game state
template ValidateAction() {
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
    signal input actionType;
    signal input actionAmount;
    signal output valid;

    // Game must be active (status == 1)
    component isActive = IsEqual();
    isActive.in[0] <== status;
    isActive.in[1] <== 1;

    // Current player's stack and street bet
    component muxStack = Mux1();
    muxStack.c[0] <== stackP2;
    muxStack.c[1] <== stackP1;
    muxStack.s <== currentPlayer - 1;
    signal currentStack <== muxStack.out;

    component muxMyBet = Mux1();
    muxMyBet.c[0] <== streetBetP2;
    muxMyBet.c[1] <== streetBetP1;
    muxMyBet.s <== currentPlayer - 1;
    signal myStreetBet <== muxMyBet.out;

    component muxOppBet = Mux1();
    muxOppBet.c[0] <== streetBetP1;
    muxOppBet.c[1] <== streetBetP2;
    muxOppBet.s <== currentPlayer - 1;
    signal oppStreetBet <== muxOppBet.out;

    // Amount to call
    component gtOpp = GreaterThan(32);
    gtOpp.in[0] <== oppStreetBet;
    gtOpp.in[1] <== myStreetBet;
    signal amountToCall <== gtOpp.out * (oppStreetBet - myStreetBet);

    // FOLD (3) - always valid
    component isFold = IsEqual();
    isFold.in[0] <== actionType;
    isFold.in[1] <== 3;

    // CHECK (5) - valid if nothing to call
    component isCheck = IsEqual();
    isCheck.in[0] <== actionType;
    isCheck.in[1] <== 5;
    component noCall = IsZero();
    noCall.in <== amountToCall;
    signal checkValid <== isCheck.out * noCall.out;

    // CALL (2) - valid if there's something to call
    component isCall = IsEqual();
    isCall.in[0] <== actionType;
    isCall.in[1] <== 2;
    signal somethingToCall <== 1 - noCall.out;
    component canAffordCall = GreaterEqThan(32);
    canAffordCall.in[0] <== currentStack;
    canAffordCall.in[1] <== amountToCall;
    signal callValid1 <== isCall.out * somethingToCall;
    signal callValid <== callValid1 * canAffordCall.out;

    // BET (1) - valid if no prior bet
    component isBet = IsEqual();
    isBet.in[0] <== actionType;
    isBet.in[1] <== 1;
    component lastNull = IsEqual();
    lastNull.in[0] <== lastAction;
    lastNull.in[1] <== 0;
    component lastCheck = IsEqual();
    lastCheck.in[0] <== lastAction;
    lastCheck.in[1] <== 5;
    signal canBet <== lastNull.out + lastCheck.out - lastNull.out * lastCheck.out;
    component betAmountValid = GreaterEqThan(32);
    betAmountValid.in[0] <== actionAmount;
    betAmountValid.in[1] <== 1;
    component betAffordable = GreaterEqThan(32);
    betAffordable.in[0] <== currentStack;
    betAffordable.in[1] <== actionAmount;
    signal betValid1 <== isBet.out * canBet;
    signal betValid2 <== betValid1 * betAmountValid.out;
    signal betValid <== betValid2 * betAffordable.out;

    // RAISE (4) - valid if there's a bet to raise
    component isRaise = IsEqual();
    isRaise.in[0] <== actionType;
    isRaise.in[1] <== 4;
    component lastBet = IsEqual();
    lastBet.in[0] <== lastAction;
    lastBet.in[1] <== 1;
    component lastRaise = IsEqual();
    lastRaise.in[0] <== lastAction;
    lastRaise.in[1] <== 4;
    component lastAllIn = IsEqual();
    lastAllIn.in[0] <== lastAction;
    lastAllIn.in[1] <== 6;
    signal canRaise <== lastBet.out + lastRaise.out + lastAllIn.out;
    signal minRaise <== lastBetSize * 2;
    component raiseAmountValid = GreaterEqThan(32);
    raiseAmountValid.in[0] <== actionAmount;
    raiseAmountValid.in[1] <== minRaise;
    component raiseAffordable = GreaterEqThan(32);
    raiseAffordable.in[0] <== currentStack;
    raiseAffordable.in[1] <== actionAmount - myStreetBet;
    signal raiseValid1 <== isRaise.out * canRaise;
    signal raiseValid2 <== raiseValid1 * raiseAmountValid.out;
    signal raiseValid <== raiseValid2 * raiseAffordable.out;

    // ALL_IN (6) - valid if we have chips
    component isAllIn = IsEqual();
    isAllIn.in[0] <== actionType;
    isAllIn.in[1] <== 6;
    component hasChips = GreaterThan(32);
    hasChips.in[0] <== currentStack;
    hasChips.in[1] <== 0;
    signal allInValid <== isAllIn.out * hasChips.out;

    signal anyValid <== isFold.out + checkValid + callValid + betValid + raiseValid + allInValid;
    valid <== isActive.out * anyValid;
}

// Apply action and compute new state
template ApplyAction() {
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
    signal input actionType;
    signal input actionAmount;

    signal output newStackP1;
    signal output newStackP2;
    signal output newPot;
    signal output newStreet;
    signal output newCurrentPlayer;
    signal output newLastAction;
    signal output newLastBetSize;
    signal output newStreetBetP1;
    signal output newStreetBetP2;
    signal output newStatus;

    // Current player info
    component muxStack = Mux1();
    muxStack.c[0] <== stackP2;
    muxStack.c[1] <== stackP1;
    muxStack.s <== currentPlayer - 1;
    signal currentStack <== muxStack.out;

    component muxMyBet = Mux1();
    muxMyBet.c[0] <== streetBetP2;
    muxMyBet.c[1] <== streetBetP1;
    muxMyBet.s <== currentPlayer - 1;
    signal myStreetBet <== muxMyBet.out;

    component muxOppBet = Mux1();
    muxOppBet.c[0] <== streetBetP1;
    muxOppBet.c[1] <== streetBetP2;
    muxOppBet.s <== currentPlayer - 1;
    signal oppStreetBet <== muxOppBet.out;

    component gtOpp = GreaterThan(32);
    gtOpp.in[0] <== oppStreetBet;
    gtOpp.in[1] <== myStreetBet;
    signal amountToCall <== gtOpp.out * (oppStreetBet - myStreetBet);

    // Action flags
    component isFold = IsEqual();
    isFold.in[0] <== actionType;
    isFold.in[1] <== 3;
    component isCall = IsEqual();
    isCall.in[0] <== actionType;
    isCall.in[1] <== 2;
    component isBet = IsEqual();
    isBet.in[0] <== actionType;
    isBet.in[1] <== 1;
    component isRaise = IsEqual();
    isRaise.in[0] <== actionType;
    isRaise.in[1] <== 4;
    component isAllIn = IsEqual();
    isAllIn.in[0] <== actionType;
    isAllIn.in[1] <== 6;

    // Compute chips to add
    signal callChips <== isCall.out * amountToCall;
    signal betChips <== isBet.out * actionAmount;
    signal raiseChips <== isRaise.out * (actionAmount - myStreetBet);
    signal allInChips <== isAllIn.out * currentStack;
    signal chipsToAdd <== callChips + betChips + raiseChips + allInChips;

    // Update stacks
    component isP1 = IsEqual();
    isP1.in[0] <== currentPlayer;
    isP1.in[1] <== 1;
    newStackP1 <== stackP1 - isP1.out * chipsToAdd;
    newStackP2 <== stackP2 - (1 - isP1.out) * chipsToAdd;

    newPot <== pot + chipsToAdd;
    newStreetBetP1 <== streetBetP1 + isP1.out * chipsToAdd;
    newStreetBetP2 <== streetBetP2 + (1 - isP1.out) * chipsToAdd;
    newStatus <== status + isFold.out;
    newStreet <== street;
    newCurrentPlayer <== 3 - currentPlayer;
    newLastAction <== actionType;

    signal newBetBet <== isBet.out * actionAmount;
    signal newBetRaise <== isRaise.out * actionAmount;
    signal keepOld <== (1 - isBet.out) * (1 - isRaise.out);
    newLastBetSize <== newBetBet + newBetRaise + keepOld * lastBetSize;
}

template GameAction() {
    // === Public inputs ===
    signal input stateBeforeCommitment;
    signal input stateAfterCommitment;
    signal input playerHash;

    // === Private inputs ===
    signal input stackP1Before;
    signal input stackP2Before;
    signal input potBefore;
    signal input streetBefore;
    signal input currentPlayerBefore;
    signal input lastActionBefore;
    signal input lastBetSizeBefore;
    signal input streetBetP1Before;
    signal input streetBetP2Before;
    signal input statusBefore;
    signal input dealer;
    signal input actionType;
    signal input actionAmount;
    signal input player1Hash;
    signal input player2Hash;

    // === Verify state before commitment ===
    component commitBefore = GameStateCommitment();
    commitBefore.stackP1 <== stackP1Before;
    commitBefore.stackP2 <== stackP2Before;
    commitBefore.pot <== potBefore;
    commitBefore.street <== streetBefore;
    commitBefore.currentPlayer <== currentPlayerBefore;
    commitBefore.lastAction <== lastActionBefore;
    commitBefore.lastBetSize <== lastBetSizeBefore;
    commitBefore.streetBetP1 <== streetBetP1Before;
    commitBefore.streetBetP2 <== streetBetP2Before;
    commitBefore.status <== statusBefore;
    commitBefore.dealer <== dealer;
    commitBefore.out === stateBeforeCommitment;

    // === Verify correct player ===
    component isP1 = IsEqual();
    isP1.in[0] <== currentPlayerBefore;
    isP1.in[1] <== 1;
    component muxPlayerHash = Mux1();
    muxPlayerHash.c[0] <== player2Hash;
    muxPlayerHash.c[1] <== player1Hash;
    muxPlayerHash.s <== isP1.out;
    muxPlayerHash.out === playerHash;

    // === Validate action ===
    component validate = ValidateAction();
    validate.stackP1 <== stackP1Before;
    validate.stackP2 <== stackP2Before;
    validate.pot <== potBefore;
    validate.street <== streetBefore;
    validate.currentPlayer <== currentPlayerBefore;
    validate.lastAction <== lastActionBefore;
    validate.lastBetSize <== lastBetSizeBefore;
    validate.streetBetP1 <== streetBetP1Before;
    validate.streetBetP2 <== streetBetP2Before;
    validate.status <== statusBefore;
    validate.dealer <== dealer;
    validate.actionType <== actionType;
    validate.actionAmount <== actionAmount;
    validate.valid === 1;

    // === Apply action ===
    component apply = ApplyAction();
    apply.stackP1 <== stackP1Before;
    apply.stackP2 <== stackP2Before;
    apply.pot <== potBefore;
    apply.street <== streetBefore;
    apply.currentPlayer <== currentPlayerBefore;
    apply.lastAction <== lastActionBefore;
    apply.lastBetSize <== lastBetSizeBefore;
    apply.streetBetP1 <== streetBetP1Before;
    apply.streetBetP2 <== streetBetP2Before;
    apply.status <== statusBefore;
    apply.dealer <== dealer;
    apply.actionType <== actionType;
    apply.actionAmount <== actionAmount;

    // === Verify state after commitment ===
    component commitAfter = GameStateCommitment();
    commitAfter.stackP1 <== apply.newStackP1;
    commitAfter.stackP2 <== apply.newStackP2;
    commitAfter.pot <== apply.newPot;
    commitAfter.street <== apply.newStreet;
    commitAfter.currentPlayer <== apply.newCurrentPlayer;
    commitAfter.lastAction <== apply.newLastAction;
    commitAfter.lastBetSize <== apply.newLastBetSize;
    commitAfter.streetBetP1 <== apply.newStreetBetP1;
    commitAfter.streetBetP2 <== apply.newStreetBetP2;
    commitAfter.status <== apply.newStatus;
    commitAfter.dealer <== dealer;
    commitAfter.out === stateAfterCommitment;
}

component main {public [stateBeforeCommitment, stateAfterCommitment, playerHash]} = GameAction();
