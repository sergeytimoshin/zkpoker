// Game state management for ZK Poker
// Handles state transitions and Prover.toml generation

import type { GameState, Action, Scalar, MaskedCard } from './types.js';
import {
  ACTION_NULL, ACTION_BET, ACTION_CALL, ACTION_FOLD,
  ACTION_RAISE, ACTION_CHECK, ACTION_ALL_IN,
  STREET_PREFLOP, STREET_SHOWDOWN,
  STATUS_ACTIVE, STATUS_FINISHED
} from './types.js';

// Re-export action constants for convenience
export {
  ACTION_NULL, ACTION_BET, ACTION_CALL, ACTION_FOLD,
  ACTION_RAISE, ACTION_CHECK, ACTION_ALL_IN,
  STREET_PREFLOP, STREET_SHOWDOWN,
  STATUS_ACTIVE, STATUS_FINISHED
};
import { CARD_PRIMES } from './cards.js';
import { pedersenHash } from './pedersen.js';

// Re-export pedersenHash for convenience
export { pedersenHash };

// BN254 field order
const FIELD_ORDER = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// Modular arithmetic
function mod(a: bigint, m: bigint = FIELD_ORDER): bigint {
  return ((a % m) + m) % m;
}

function modInverse(a: bigint, m: bigint = FIELD_ORDER): bigint {
  let [old_r, r] = [m, mod(a, m)];
  let [old_s, s] = [0n, 1n];
  while (r !== 0n) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  return mod(old_s, m);
}

// Simplified EC operations for scalar multiplication (used by shuffle Prover.toml generator)
interface Point {
  x: bigint;
  y: bigint;
  isInfinity: boolean;
}

const INFINITY: Point = { x: 0n, y: 0n, isInfinity: true };

function pointAdd(p1: Point, p2: Point): Point {
  if (p1.isInfinity) return p2;
  if (p2.isInfinity) return p1;
  if (p1.x === p2.x && mod(p1.y + p2.y) === 0n) return INFINITY;

  let lambda: bigint;
  if (p1.x === p2.x && p1.y === p2.y) {
    lambda = mod(3n * p1.x * p1.x * modInverse(2n * p1.y));
  } else {
    lambda = mod((p2.y - p1.y) * modInverse(p2.x - p1.x));
  }

  const x = mod(lambda * lambda - p1.x - p2.x);
  const y = mod(lambda * (p1.x - x) - p1.y);
  return { x, y, isInfinity: false };
}

function scalarMul(scalar: bigint, point: Point): Point {
  if (point.isInfinity || scalar === 0n) return INFINITY;
  let result = INFINITY;
  let current = point;
  let s = mod(scalar);
  while (s > 0n) {
    if (s & 1n) result = pointAdd(result, current);
    current = pointAdd(current, current);
    s >>= 1n;
  }
  return result;
}

// Create initial game state
export function createGameState(stackP1: number, stackP2: number, dealer: number): GameState {
  return {
    stackP1, stackP2, pot: 0,
    street: STREET_PREFLOP,
    currentPlayer: dealer === 1 ? 2 : 1,
    lastAction: ACTION_NULL,
    lastBetSize: 0,
    streetBetP1: 0, streetBetP2: 0,
    status: STATUS_ACTIVE,
    dealer
  };
}

// Post blinds
export function postBlinds(state: GameState, smallBlind: number, bigBlind: number): GameState {
  const sbPlayer = state.dealer === 1 ? 1 : 2;
  const [newStackP1, newStackP2, newStreetBetP1, newStreetBetP2] = sbPlayer === 1
    ? [state.stackP1 - smallBlind, state.stackP2 - bigBlind, smallBlind, bigBlind]
    : [state.stackP1 - bigBlind, state.stackP2 - smallBlind, bigBlind, smallBlind];

  return {
    stackP1: newStackP1, stackP2: newStackP2,
    pot: smallBlind + bigBlind,
    street: STREET_PREFLOP,
    currentPlayer: sbPlayer,
    lastAction: ACTION_BET,
    lastBetSize: bigBlind,
    streetBetP1: newStreetBetP1, streetBetP2: newStreetBetP2,
    status: STATUS_ACTIVE,
    dealer: state.dealer
  };
}

// Compute game state commitment
export function gameStateCommitment(state: GameState): bigint {
  return pedersenHash([
    BigInt(state.stackP1), BigInt(state.stackP2), BigInt(state.pot),
    BigInt(state.street), BigInt(state.currentPlayer), BigInt(state.lastAction),
    BigInt(state.lastBetSize), BigInt(state.streetBetP1), BigInt(state.streetBetP2),
    BigInt(state.status), BigInt(state.dealer)
  ]);
}

// Apply action to state
export function applyAction(state: GameState, action: Action): GameState {
  const currentStack = state.currentPlayer === 1 ? state.stackP1 : state.stackP2;
  const myStreetBet = state.currentPlayer === 1 ? state.streetBetP1 : state.streetBetP2;
  const oppStreetBet = state.currentPlayer === 1 ? state.streetBetP2 : state.streetBetP1;
  const toCall = oppStreetBet > myStreetBet ? oppStreetBet - myStreetBet : 0;

  let chipsToAdd = 0;
  switch (action.actionType) {
    case ACTION_CALL: chipsToAdd = Math.min(toCall, currentStack); break;
    case ACTION_BET: chipsToAdd = action.amount; break;
    case ACTION_RAISE: chipsToAdd = action.amount - myStreetBet; break;
    case ACTION_ALL_IN: chipsToAdd = currentStack; break;
  }

  const newStackP1 = state.currentPlayer === 1 ? state.stackP1 - chipsToAdd : state.stackP1;
  const newStackP2 = state.currentPlayer === 2 ? state.stackP2 - chipsToAdd : state.stackP2;
  let newStreetBetP1 = state.currentPlayer === 1 ? state.streetBetP1 + chipsToAdd : state.streetBetP1;
  let newStreetBetP2 = state.currentPlayer === 2 ? state.streetBetP2 + chipsToAdd : state.streetBetP2;
  const newPot = state.pot + chipsToAdd;
  const newStatus = action.actionType === ACTION_FOLD ? STATUS_FINISHED : state.status;

  const betsEqual = newStreetBetP1 === newStreetBetP2;
  const bothActed = state.lastAction !== ACTION_NULL;
  const streetComplete = betsEqual && bothActed && (action.actionType === ACTION_CALL || action.actionType === ACTION_CHECK);

  let newStreet = state.street;
  let newLastAction = action.actionType;
  let newLastBet = state.lastBetSize;
  let newCurrentPlayer = state.currentPlayer === 1 ? 2 : 1;

  if (streetComplete && state.street < STREET_SHOWDOWN) {
    newStreet = state.street + 1;
    newLastAction = ACTION_NULL;
    newLastBet = 0;
    newStreetBetP1 = 0;
    newStreetBetP2 = 0;
    newCurrentPlayer = state.dealer === 1 ? 2 : 1;
  } else if (action.actionType === ACTION_RAISE) {
    newLastBet = action.amount;
  } else if (action.actionType === ACTION_BET) {
    newLastBet = chipsToAdd;
  }

  return {
    stackP1: newStackP1, stackP2: newStackP2, pot: newPot,
    street: newStreet, currentPlayer: newCurrentPlayer,
    lastAction: newLastAction, lastBetSize: newLastBet,
    streetBetP1: newStreetBetP1, streetBetP2: newStreetBetP2,
    status: newStatus, dealer: state.dealer
  };
}

// Card commitment for masked cards
export function cardCommitment(card: MaskedCard): bigint {
  const epkX = card.epk.isInfinite ? 0n : card.epk.x;
  const epkY = card.epk.isInfinite ? 0n : card.epk.y;
  const pkX = card.pk.isInfinite ? 0n : card.pk.x;
  const pkY = card.pk.isInfinite ? 0n : card.pk.y;
  return pedersenHash([epkX, epkY, card.msg.x, card.msg.y, pkX, pkY]);
}

// Format bigint as hex for Prover.toml
export function toHex(value: bigint): string {
  return `"0x${value.toString(16)}"`;
}

// Generate Prover.toml for circuit_game_action
export function generateGameActionProverToml(params: {
  stateBefore: GameState;
  stateAfter: GameState;
  player1PubKey: { x: bigint; y: bigint };
  player2PubKey: { x: bigint; y: bigint };
  actionType: number;
  actionAmount: number;
}): string {
  const { stateBefore, stateAfter, player1PubKey, player2PubKey, actionType, actionAmount } = params;

  // Compute commitments
  const stateBeforeCommitment = gameStateCommitment(stateBefore);
  const stateAfterCommitment = gameStateCommitment(stateAfter);

  // Player hashes
  const player1Hash = pedersenHash([player1PubKey.x, player1PubKey.y]);
  const player2Hash = pedersenHash([player2PubKey.x, player2PubKey.y]);

  // Acting player's hash
  const playerHash = stateBefore.currentPlayer === 1 ? player1Hash : player2Hash;

  return `# circuit_game_action Prover.toml
state_before_commitment = ${toHex(stateBeforeCommitment)}
state_after_commitment = ${toHex(stateAfterCommitment)}
player_hash = ${toHex(playerHash)}

stack_p1_before = ${stateBefore.stackP1}
stack_p2_before = ${stateBefore.stackP2}
pot_before = ${stateBefore.pot}
street_before = ${stateBefore.street}
current_player_before = ${stateBefore.currentPlayer}
last_action_before = ${stateBefore.lastAction}
last_bet_size_before = ${stateBefore.lastBetSize}
street_bet_p1_before = ${stateBefore.streetBetP1}
street_bet_p2_before = ${stateBefore.streetBetP2}
status_before = ${stateBefore.status}
dealer = ${stateBefore.dealer}

action_type = ${actionType}
action_amount = ${actionAmount}

player1_hash = ${toHex(player1Hash)}
player2_hash = ${toHex(player2Hash)}
`;
}

// Generate Prover.toml for circuit_shuffle
export function generateShuffleProverToml(params: {
  cardsBefore: MaskedCard[];
  permutation: number[];
  playerSecret: Scalar;
  nonces: Scalar[];
  maskedCards: MaskedCard[];
}): string {
  const { cardsBefore, permutation, playerSecret, nonces, maskedCards } = params;

  // Compute deck commitment before (unmasked cards)
  let commitmentBefore = 1n;
  const cardsBeforeFields: string[] = [];
  for (const card of cardsBefore) {
    const msgX = card.msg.x;
    const msgY = card.msg.y;
    cardsBeforeFields.push(`  ${toHex(msgX)},`);
    cardsBeforeFields.push(`  ${toHex(msgY)},`);
    const cardHash = pedersenHash([0n, 0n, msgX, msgY, 0n, 0n]);
    commitmentBefore = mod(commitmentBefore * (cardHash + 1n));
  }

  // Compute deck commitment after
  let commitmentAfter = 1n;
  const cardsAfterFields: string[] = [];
  for (const card of maskedCards) {
    const epkX = card.epk.x;
    const epkY = card.epk.y;
    const msgX = card.msg.x;
    const msgY = card.msg.y;
    const pkX = card.pk.x;
    const pkY = card.pk.y;
    cardsAfterFields.push(`  ${toHex(epkX)}, ${toHex(epkY)}, ${toHex(msgX)}, ${toHex(msgY)}, ${toHex(pkX)}, ${toHex(pkY)},`);
    const cardHash = pedersenHash([epkX, epkY, msgX, msgY, pkX, pkY]);
    commitmentAfter = mod(commitmentAfter * (cardHash + 1n));
  }

  // Player public key
  const GENERATOR = { x: 1n, y: 17631683881184975370165255887551781615748388533673675138860n, isInfinity: false };
  const secret = playerSecret.lo + (playerSecret.hi << 128n);
  const playerPub = scalarMul(secret, GENERATOR);

  const noncesLo = nonces.map(n => toHex(n.lo)).join(', ');
  const noncesHi = nonces.map(n => toHex(n.hi)).join(', ');
  const permStr = permutation.join(', ');

  return `# circuit_shuffle Prover.toml
deck_commitment_before = ${toHex(commitmentBefore)}
deck_commitment_after = ${toHex(commitmentAfter)}
player_pub_x = ${toHex(playerPub.x)}
player_pub_y = ${toHex(playerPub.y)}

cards_before = [
${cardsBeforeFields.join('\n')}
]

cards_after = [
${cardsAfterFields.join('\n')}
]

permutation = [${permStr}]
nonces_lo = [${noncesLo}]
nonces_hi = [${noncesHi}]

player_secret_lo = ${toHex(playerSecret.lo)}
player_secret_hi = ${toHex(playerSecret.hi)}
`;
}

// Generate random permutation using Fisher-Yates
export function randomPermutation(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    const j = Math.abs((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Generate random scalar
export function randomScalarPair(): Scalar {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let value = 0n;
  for (let i = 0; i < 32; i++) {
    value = (value << 8n) | BigInt(bytes[i]);
  }
  value = value % FIELD_ORDER;
  return { lo: value & ((1n << 128n) - 1n), hi: value >> 128n };
}
