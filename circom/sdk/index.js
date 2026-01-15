// ZK Poker SDK - Browser-compatible Circom/snarkjs implementation
// Re-exports all modules for convenient access

export * from './babyjub.js';
export * from './elgamal.js';
export * from './card.js';
export * from './poseidon.js';
export * from './prover.js';

// Re-export specific named exports for clarity
import { init as _initBabyjub } from './babyjub.js';
export const initBabyjub = _initBabyjub;

export {
  init,
  generateKeypair,
  scalarMul,
  addPoints,
  subPoints,
  secretToPublicKey,
  randomScalar,
  isInfinity,
  SUBORDER,
  BASE8,
  INFINITY
} from './babyjub.js';

export {
  createCard,
  addPlayerToCardMask,
  maskCard,
  addPlayerAndMask,
  partialUnmask,
  isUnmasked
} from './elgamal.js';

export {
  indexToCard,
  cardToIndex,
  cardToString,
  parseCard,
  cardIndexToPoint,
  createDeck,
  getRankPrime,
  calculateLookupKey,
  isFlush,
  findCardFromPoint,
  precomputeCardPoints,
  RANKS,
  SUITS,
  RANK_PRIMES
} from './card.js';

import { init as _initPoseidon } from './poseidon.js';
export const initPoseidon = _initPoseidon;

export {
  hash,
  hash2,
  hash3,
  commitCard,
  commitGameState,
  commitDeck,
  commitHoleCards,
  commitBoardCards,
  verifyMerkleProof,
  buildMerkleTree,
  getMerkleProof
} from './poseidon.js';

export {
  CIRCUITS,
  loadCircuit,
  loadCircuitsFromURLs,
  prove,
  verify,
  exportCalldata,
  proveMask,
  proveUnmask,
  proveGameAction,
  proveShuffle,
  proveHandEval,
  proveShowdown,
  prepareMaskInputs,
  prepareUnmaskInputs
} from './prover.js';
