// Browser-based Groth16 prover using snarkjs
// Generates proofs for ZK Poker circuits

import * as snarkjs from 'snarkjs';

// Circuit types
export const CIRCUITS = {
  MASK: 'mask',
  UNMASK: 'unmask',
  GAME_ACTION: 'game_action',
  SHUFFLE: 'shuffle',
  HAND_EVAL: 'hand_eval',
  SHOWDOWN: 'showdown'
};

// Loaded circuit artifacts
const circuitCache = new Map();

// Load circuit artifacts (wasm + zkey)
export async function loadCircuit(circuitName, wasmPath, zkeyPath) {
  if (circuitCache.has(circuitName)) {
    return circuitCache.get(circuitName);
  }

  const circuit = { wasmPath, zkeyPath };
  circuitCache.set(circuitName, circuit);
  return circuit;
}

// Load circuits from URLs (for browser)
export async function loadCircuitsFromURLs(baseURL) {
  const circuits = [
    CIRCUITS.MASK,
    CIRCUITS.UNMASK,
    CIRCUITS.GAME_ACTION,
    CIRCUITS.SHUFFLE,
    CIRCUITS.HAND_EVAL,
    CIRCUITS.SHOWDOWN
  ];

  for (const name of circuits) {
    await loadCircuit(
      name,
      `${baseURL}/${name}/${name}_js/${name}.wasm`,
      `${baseURL}/${name}/${name}.zkey`
    );
  }
}

// Generate proof for a circuit
export async function prove(circuitName, inputs) {
  const circuit = circuitCache.get(circuitName);
  if (!circuit) {
    throw new Error(`Circuit not loaded: ${circuitName}`);
  }

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    inputs,
    circuit.wasmPath,
    circuit.zkeyPath
  );

  return { proof, publicSignals };
}

// Verify proof
export async function verify(circuitName, proof, publicSignals, vkeyPath) {
  const vkey = await fetch(vkeyPath).then(r => r.json());
  return await snarkjs.groth16.verify(vkey, publicSignals, proof);
}

// Export proof for on-chain verification
export function exportCalldata(proof, publicSignals) {
  return snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
}

// === Circuit-specific proof generators ===

// Mask circuit proof
export async function proveMask(inputs) {
  // inputs: {
  //   epkX, epkY, epkIsInf, msgX, msgY, pkX, pkY, pkIsInf,
  //   playerSecret, nonce,
  //   outEpkX, outEpkY, outMsgX, outMsgY, outPkX, outPkY,
  //   playerPubX, playerPubY
  // }
  return await prove(CIRCUITS.MASK, inputs);
}

// Unmask circuit proof
export async function proveUnmask(inputs) {
  // inputs: {
  //   epkX, epkY, msgX, msgY, pkX, pkY,
  //   playerSecret,
  //   outMsgX, outMsgY, outPkX, outPkY,
  //   playerPubX, playerPubY
  // }
  return await prove(CIRCUITS.UNMASK, inputs);
}

// Game action circuit proof
export async function proveGameAction(inputs) {
  // inputs: {
  //   stackP1Before, stackP2Before, pot, street, currentPlayer,
  //   lastAction, lastBetSize, streetBetP1, streetBetP2, status, dealer,
  //   actionType, betSize, playerIndex, playerSecret,
  //   stackP1After, stackP2After, potAfter, streetAfter, currentPlayerAfter,
  //   lastActionAfter, lastBetSizeAfter, streetBetP1After, streetBetP2After,
  //   statusAfter
  // }
  return await prove(CIRCUITS.GAME_ACTION, inputs);
}

// Shuffle circuit proof
export async function proveShuffle(inputs) {
  // inputs: {
  //   cardsBefore: [52][2], cardsAfter: [52][6],
  //   permutation: [52], playerSecret, nonces: [52],
  //   deckCommitmentBefore, deckCommitmentAfter,
  //   playerPubX, playerPubY
  // }
  return await prove(CIRCUITS.SHUFFLE, inputs);
}

// Hand eval circuit proof
export async function proveHandEval(inputs) {
  // inputs: {
  //   holeCard0, holeCard1,
  //   boardCard0, boardCard1, boardCard2, boardCard3, boardCard4,
  //   useHole0, useHole1, useBoard0, useBoard1, useBoard2, useBoard3, useBoard4,
  //   isFlush, lookupKey, handRank,
  //   merkleProof: [13], merklePathBits: [13],
  //   merkleRoot, holeCardsCommitment, boardCardsCommitment
  // }
  return await prove(CIRCUITS.HAND_EVAL, inputs);
}

// Showdown circuit proof
export async function proveShowdown(inputs) {
  // inputs: {
  //   stackP1Before, stackP2Before, pot, street, currentPlayer,
  //   lastAction, lastBetSize, streetBetP1, streetBetP2, status, dealer,
  //   p1HandRank, p2HandRank,
  //   p1LookupKey, p1IsFlush, p1MerkleProof: [13], p1MerklePathBits: [13],
  //   p2LookupKey, p2IsFlush, p2MerkleProof: [13], p2MerklePathBits: [13],
  //   stateBeforeCommitment, stateAfterCommitment,
  //   merkleRoot, p1HoleCommitment, p2HoleCommitment, boardCommitment
  // }
  return await prove(CIRCUITS.SHOWDOWN, inputs);
}

// === Input preparation helpers ===

// Prepare inputs for mask proof
export function prepareMaskInputs(cardBefore, cardAfter, playerSecret, nonce, playerPub) {
  const isInfinity = (p) => p[0] === 0n && p[1] === 1n;

  return {
    epkX: cardBefore.epk[0].toString(),
    epkY: cardBefore.epk[1].toString(),
    epkIsInf: isInfinity(cardBefore.epk) ? '1' : '0',
    msgX: cardBefore.msg[0].toString(),
    msgY: cardBefore.msg[1].toString(),
    pkX: cardBefore.pk[0].toString(),
    pkY: cardBefore.pk[1].toString(),
    pkIsInf: isInfinity(cardBefore.pk) ? '1' : '0',
    playerSecret: playerSecret.toString(),
    nonce: nonce.toString(),
    outEpkX: cardAfter.epk[0].toString(),
    outEpkY: cardAfter.epk[1].toString(),
    outMsgX: cardAfter.msg[0].toString(),
    outMsgY: cardAfter.msg[1].toString(),
    outPkX: cardAfter.pk[0].toString(),
    outPkY: cardAfter.pk[1].toString(),
    playerPubX: playerPub[0].toString(),
    playerPubY: playerPub[1].toString()
  };
}

// Prepare inputs for unmask proof
export function prepareUnmaskInputs(cardBefore, cardAfter, playerSecret, playerPub) {
  return {
    epkX: cardBefore.epk[0].toString(),
    epkY: cardBefore.epk[1].toString(),
    msgX: cardBefore.msg[0].toString(),
    msgY: cardBefore.msg[1].toString(),
    pkX: cardBefore.pk[0].toString(),
    pkY: cardBefore.pk[1].toString(),
    playerSecret: playerSecret.toString(),
    outMsgX: cardAfter.msg[0].toString(),
    outMsgY: cardAfter.msg[1].toString(),
    outPkX: cardAfter.pk[0].toString(),
    outPkY: cardAfter.pk[1].toString(),
    playerPubX: playerPub[0].toString(),
    playerPubY: playerPub[1].toString()
  };
}
