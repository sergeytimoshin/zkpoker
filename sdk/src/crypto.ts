/**
 * @deprecated This file is deprecated and will be removed in a future version.
 * Use the following imports instead:
 * - For ElGamal operations: import from './elgamal.js'
 * - For card operations: import from './card.js'
 * - For EC operations: import from './grumpkin.js'
 *
 * The elgamal.ts implementation has proper P-P=O handling and uses
 * the verified grumpkin.ts EC operations.
 */

// Cryptographic utilities for ZK Poker
// Implements ElGamal operations matching the Noir circuits

import { CARD_PRIMES } from './cards.js';
import { pedersenHash } from './game-state.js';
import type { MaskedCard, PlayerKeys } from './types.js';

// BN254 curve parameters (Grumpkin)
// Note: These are simplified - in production, use a proper EC library
const FIELD_ORDER = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// Simplified point representation
interface Point {
  x: bigint;
  y: bigint;
  isInfinite: boolean;
}

// Point at infinity
const INFINITY: Point = { x: 0n, y: 0n, isInfinite: true };

// Generator point for Grumpkin curve (embedded curve for BN254)
// This matches Noir's stdlib embedded curve generator
const GENERATOR: Point = {
  x: 1n,
  y: 17631683881184975370165255887551781615748388533673675138860n,
  isInfinite: false,
};

// Modular arithmetic helpers
function mod(a: bigint, m: bigint = FIELD_ORDER): bigint {
  return ((a % m) + m) % m;
}

function modInverse(a: bigint, m: bigint = FIELD_ORDER): bigint {
  // Extended Euclidean algorithm to compute a^(-1) mod m
  let [old_r, r] = [m, mod(a, m)];
  let [old_s, s] = [0n, 1n];
  while (r !== 0n) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  return mod(old_s, m);
}

// Simplified EC operations (for demonstration)
// In production, use a proper EC library like noble-curves
function pointAdd(p1: Point, p2: Point): Point {
  if (p1.isInfinite) return p2;
  if (p2.isInfinite) return p1;

  if (p1.x === p2.x) {
    if (p1.y === p2.y) {
      // Point doubling
      const s = mod((3n * p1.x * p1.x) * modInverse(2n * p1.y));
      const x = mod(s * s - 2n * p1.x);
      const y = mod(s * (p1.x - x) - p1.y);
      return { x, y, isInfinite: false };
    }
    return INFINITY;
  }

  const s = mod((p2.y - p1.y) * modInverse(p2.x - p1.x));
  const x = mod(s * s - p1.x - p2.x);
  const y = mod(s * (p1.x - x) - p1.y);
  return { x, y, isInfinite: false };
}

function pointSub(p1: Point, p2: Point): Point {
  if (p2.isInfinite) return p1;
  return pointAdd(p1, { x: p2.x, y: mod(-p2.y), isInfinite: false });
}

function scalarMul(scalar: bigint, point: Point): Point {
  if (point.isInfinite || scalar === 0n) return INFINITY;

  let result = INFINITY;
  let current = point;
  let s = mod(scalar);

  while (s > 0n) {
    if (s & 1n) {
      result = pointAdd(result, current);
    }
    current = pointAdd(current, current);
    s >>= 1n;
  }

  return result;
}

// Generate player keys
export function generatePlayerKeys(): PlayerKeys {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let secret = 0n;
  for (let i = 0; i < 32; i++) {
    secret = (secret << 8n) | BigInt(bytes[i]);
  }
  secret = mod(secret);

  const publicKey = scalarMul(secret, GENERATOR);

  return {
    secret,
    publicKey: { x: publicKey.x, y: publicKey.y },
  };
}

// Create an unmasked card from card index
// Uses Pedersen hash to derive card point, matching the Noir circuit implementation
export function createCard(cardIndex: number): MaskedCard {
  if (cardIndex < 0 || cardIndex >= 52) {
    throw new Error(`Invalid card index: ${cardIndex}`);
  }

  // Hash the card prime to get a scalar using Pedersen hash
  // This matches the Noir circuit: card_index_to_point in card.nr
  const cardPrime = CARD_PRIMES[cardIndex];
  const scalarField = pedersenHash([cardPrime]);
  const cardPoint = scalarMul(scalarField, GENERATOR);

  return {
    epk: { x: 0n, y: 0n, isInfinite: true },
    msg: { x: cardPoint.x, y: cardPoint.y },
    pk: { x: 0n, y: 0n, isInfinite: true },
  };
}

// Add a player to a card's masking group
export function addPlayerToCardMask(card: MaskedCard, playerSecret: bigint): MaskedCard {
  const playerPub = scalarMul(playerSecret, GENERATOR);

  const isFirstPlayer = card.pk.isInfinite;

  // New pk = old_pk + player_pub
  const newPk = isFirstPlayer
    ? { x: playerPub.x, y: playerPub.y, isInfinite: false }
    : pointAdd(
        { x: card.pk.x, y: card.pk.y, isInfinite: card.pk.isInfinite },
        playerPub
      );

  // If first player or no epk, msg unchanged
  let newMsg = card.msg;
  if (!isFirstPlayer && !card.epk.isInfinite) {
    const epkScaled = scalarMul(playerSecret, {
      x: card.epk.x,
      y: card.epk.y,
      isInfinite: card.epk.isInfinite,
    });
    const msgPoint = pointAdd(
      { x: card.msg.x, y: card.msg.y, isInfinite: false },
      epkScaled
    );
    newMsg = { x: msgPoint.x, y: msgPoint.y };
  }

  return {
    epk: card.epk,
    msg: newMsg,
    pk: { x: newPk.x, y: newPk.y, isInfinite: newPk.isInfinite },
  };
}

// Mask a card with a nonce
export function mask(card: MaskedCard, nonce: bigint): MaskedCard {
  if (card.pk.isInfinite) {
    throw new Error('Cannot mask card with no players');
  }

  // Ephemeral public key from nonce
  const ephemeralPub = scalarMul(nonce, GENERATOR);

  // New epk = old_epk + ephemeral_pub
  const newEpk = card.epk.isInfinite
    ? { x: ephemeralPub.x, y: ephemeralPub.y, isInfinite: false }
    : pointAdd(
        { x: card.epk.x, y: card.epk.y, isInfinite: card.epk.isInfinite },
        ephemeralPub
      );

  // msg_new = msg + pk * nonce
  const sharedSecret = scalarMul(nonce, {
    x: card.pk.x,
    y: card.pk.y,
    isInfinite: card.pk.isInfinite,
  });
  const newMsg = pointAdd(
    { x: card.msg.x, y: card.msg.y, isInfinite: false },
    sharedSecret
  );

  return {
    epk: { x: newEpk.x, y: newEpk.y, isInfinite: newEpk.isInfinite },
    msg: { x: newMsg.x, y: newMsg.y },
    pk: card.pk,
  };
}

// Partially unmask a card
export function partialUnmask(card: MaskedCard, playerSecret: bigint): MaskedCard {
  if (card.pk.isInfinite) {
    throw new Error('Card is already unmasked');
  }
  if (card.epk.isInfinite) {
    throw new Error('Invalid epk for unmasking');
  }

  // Decryption share: d = epk * player_secret
  const decryptionShare = scalarMul(playerSecret, {
    x: card.epk.x,
    y: card.epk.y,
    isInfinite: card.epk.isInfinite,
  });

  // msg_new = msg - decryption_share
  const newMsg = pointSub(
    { x: card.msg.x, y: card.msg.y, isInfinite: false },
    decryptionShare
  );

  // pk_new = pk - player_pub
  const playerPub = scalarMul(playerSecret, GENERATOR);
  const newPk = pointSub(
    { x: card.pk.x, y: card.pk.y, isInfinite: card.pk.isInfinite },
    playerPub
  );

  return {
    epk: card.epk,
    msg: { x: newMsg.x, y: newMsg.y },
    pk: { x: newPk.x, y: newPk.y, isInfinite: newPk.isInfinite },
  };
}

// Combined mask operation
export function addPlayerAndMask(
  card: MaskedCard,
  playerSecret: bigint,
  nonce: bigint
): MaskedCard {
  const cardWithPlayer = addPlayerToCardMask(card, playerSecret);
  return mask(cardWithPlayer, nonce);
}
