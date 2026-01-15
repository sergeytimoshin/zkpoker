/**
 * ElGamal encryption operations for mental poker
 *
 * Implements the mask/unmask protocol for commutative encryption.
 * This allows multiple players to mask a card, and any order of
 * unmasking reveals the original card.
 */

import {
  Point,
  Scalar,
  CURVE_ORDER,
  scalarMul,
  fixedBaseScalarMul,
  addPoints,
  subtractPoints,
  pointAtInfinity,
  pointsEqual,
} from "./grumpkin.js";
import { Card, createCardFromPoint } from "./card.js";
import * as nodeCrypto from "crypto";

/**
 * Compute public key from secret: G * secret
 */
export function secretToPublicKey(secret: Scalar): Point {
  return fixedBaseScalarMul(secret);
}

/**
 * Add a player to the card's masking group
 *
 * This must be called before masking can occur.
 * Mathematical operation:
 *   pk_new = pk + G * player_secret
 *   msg_new = msg + epk * player_secret (if epk exists)
 *
 * @param card The card to add the player to
 * @param playerSecret The player's private key (scalar)
 * @returns A new Card with the player added to the masking group
 */
export function addPlayerToCardMask(card: Card, playerSecret: Scalar): Card {
  // Compute player's public key: G * player_secret
  const playerPub = fixedBaseScalarMul(playerSecret);

  // Check if this is the first player being added
  const isFirstPlayer = card.pk.isInfinity;

  // New pk = old_pk + player_pub
  const newPk = isFirstPlayer ? playerPub : addPoints(card.pk, playerPub);

  // If unmasked (no players yet), don't modify msg
  // If already has players, msg_new = msg + epk * player_secret
  let newMsg: Point;
  if (isFirstPlayer || card.epk.isInfinity) {
    // No epk yet, or first player - msg unchanged
    newMsg = card.msg;
  } else {
    // msg_new = msg + epk * player_secret
    const epkScaled = scalarMul(card.epk, playerSecret);
    newMsg = addPoints(card.msg, epkScaled);
  }

  return {
    epk: card.epk,
    msg: newMsg,
    pk: newPk,
  };
}

/**
 * Mask a card with a random nonce (ElGamal encryption step)
 *
 * Mathematical operation:
 *   epk_new = epk + G * nonce (or G * nonce if epk is identity)
 *   msg_new = msg + pk * nonce
 *
 * Requirements: Card must have at least one player in pk
 *
 * @param card The card to mask
 * @param nonce Random scalar for encryption
 * @returns A new masked Card
 */
export function mask(card: Card, nonce: Scalar): Card {
  if (card.pk.isInfinity) {
    throw new Error("Cannot mask card with no players");
  }

  // Compute ephemeral public key from nonce: G * nonce
  const ephemeralPub = fixedBaseScalarMul(nonce);

  // New epk = old_epk + ephemeral_pub
  const newEpk = card.epk.isInfinity
    ? ephemeralPub
    : addPoints(card.epk, ephemeralPub);

  // Apply mask to message: msg_new = msg + pk * nonce
  const sharedSecret = scalarMul(card.pk, nonce);
  const newMsg = addPoints(card.msg, sharedSecret);

  return {
    epk: newEpk,
    msg: newMsg,
    pk: card.pk,
  };
}

/**
 * Partially unmask a card (one player reveals their share)
 *
 * Mathematical operation:
 *   msg_new = msg - epk * player_secret
 *   pk_new = pk - G * player_secret
 *
 * When all players have unmasked, pk becomes the point at infinity
 * and msg contains the original card point.
 *
 * @param card The card to unmask
 * @param playerSecret The player's private key (scalar)
 * @returns A new Card with one layer of masking removed
 */
export function partialUnmask(card: Card, playerSecret: Scalar): Card {
  if (card.pk.isInfinity) {
    throw new Error("Card is already unmasked");
  }
  if (card.epk.isInfinity) {
    throw new Error("Invalid epk for unmasking");
  }

  // Compute the decryption share: d = epk * player_secret
  const decryptionShare = scalarMul(card.epk, playerSecret);

  // New msg = msg - decryption_share
  // Handle P-P=O case explicitly (avoid numerical issues)
  let newMsg: Point;
  if (pointsEqual(card.msg, decryptionShare)) {
    newMsg = pointAtInfinity();
  } else {
    newMsg = subtractPoints(card.msg, decryptionShare);
  }

  // Remove player from pk: pk_new = pk - player_pub
  const playerPub = fixedBaseScalarMul(playerSecret);
  let newPk: Point;
  if (pointsEqual(card.pk, playerPub)) {
    newPk = pointAtInfinity();
  } else {
    newPk = subtractPoints(card.pk, playerPub);
  }

  return {
    epk: card.epk,
    msg: newMsg,
    pk: newPk,
  };
}

/**
 * Combined operation: add player and mask in one step
 * This is the typical flow during the shuffle phase
 */
export function addPlayerAndMask(
  card: Card,
  playerSecret: Scalar,
  nonce: Scalar
): Card {
  const cardWithPlayer = addPlayerToCardMask(card, playerSecret);
  return mask(cardWithPlayer, nonce);
}

/**
 * Generate random scalar for use as nonce or secret
 */
export function randomScalar(): Scalar {
  // Generate cryptographically secure random bytes
  const bytes = new Uint8Array(32);
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    // Fallback for Node.js without webcrypto
    nodeCrypto.randomFillSync(bytes);
  }

  // Convert to bigint
  let value = 0n;
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8n) | BigInt(bytes[i]);
  }

  // Reduce modulo curve order
  value = value % CURVE_ORDER;

  // Split into lo/hi limbs
  const lo = value & ((1n << 128n) - 1n);
  const hi = value >> 128n;

  return { lo, hi };
}
