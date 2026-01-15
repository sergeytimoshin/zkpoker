// ZK Poker SDK
// TypeScript SDK for generating and verifying ZK proofs for mental poker

// Prover utilities (sunspot integration)
export { ZKPokerProver, toField, splitScalar, randomScalar, type SunspotPaths } from './prover.js';

// Card encoding utilities
export { CardEncoding, CARD_PRIMES, RANK_PRIMES } from './cards.js';

// Grumpkin curve operations
export {
  FIELD_MODULUS,
  CURVE_ORDER,
  GENERATOR,
  type Point,
  type Scalar,
  scalarFromBigint,
  scalarToBigint,
  mod,
  modInverse,
  pointAtInfinity,
  createPoint,
  isOnCurve,
  negatePoint,
  addPoints,
  subtractPoints,
  scalarMul,
  fixedBaseScalarMul,
  pointsEqual,
} from './grumpkin.js';

// ElGamal encryption for mental poker (uses grumpkin.ts)
export {
  secretToPublicKey,
  addPlayerToCardMask,
  mask,
  partialUnmask,
  addPlayerAndMask,
  randomScalar as randomElGamalScalar,
} from './elgamal.js';

// Card operations (uses grumpkin.ts and pedersen.ts)
export {
  DECK_SIZE,
  SUITS,
  RANKS,
  type Card,
  createCardFromPoint,
  cardIndexToPoint,
  createCard,
  isUnmasked,
  hasPlayers,
  hasEpk,
  cardCommitment,
  getCardPrime,
  getRankPrime,
  getSuit,
  getRank,
  getCardName,
  createDeck,
} from './card.js';

// Pedersen hash (compatible with Noir stdlib)
export { pedersenHash, PEDERSEN_GENERATORS } from './pedersen.js';

// Hand ranking utilities
export {
  generateHandRankings,
  buildMerkleTree,
  getMerkleProof,
  exportLookupTable,
  generateAllTables,
  HandCategory,
} from './hand-rankings.js';
export type { HandRanking } from './hand-rankings.js';

// Game state (exports Prover.toml generators and state management)
export {
  createGameState,
  postBlinds,
  applyAction,
  gameStateCommitment,
  cardCommitment as gameCardCommitment,
  pedersenHash as gamePedersenHash,
  generateGameActionProverToml,
  generateShuffleProverToml,
  randomPermutation,
  randomScalarPair,
  toHex,
} from './game-state.js';

// Types
export type { MaskedCard, ProofData, PlayerKeys, GameState, Action } from './types.js';
export {
  ACTION_NULL, ACTION_BET, ACTION_CALL, ACTION_FOLD, ACTION_RAISE, ACTION_CHECK, ACTION_ALL_IN,
  STREET_PREFLOP, STREET_FLOP, STREET_TURN, STREET_RIVER, STREET_SHOWDOWN,
  STATUS_WAITING, STATUS_ACTIVE, STATUS_FINISHED,
} from './types.js';

// DEPRECATED: crypto.ts - use elgamal.ts and card.ts instead
// The functions below are re-exported for backwards compatibility but will be removed
// export { generatePlayerKeys } from './crypto.js'; // Use secretToPublicKey from elgamal.js
