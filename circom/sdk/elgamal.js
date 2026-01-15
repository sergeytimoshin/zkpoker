// ElGamal encryption for mental poker using BabyJubJub

import {
  init, addPoints, subPoints, scalarMul, secretToPublicKey,
  isInfinity, randomScalar, INFINITY
} from './babyjub.js';

// Card structure: { epk: [x, y], msg: [x, y], pk: [x, y] }
// epk = ephemeral public key from masking
// msg = card value point
// pk = joint public key of masking players

// Create an unmasked card from a point
export function createCard(cardPoint) {
  return {
    epk: [...INFINITY],
    msg: cardPoint,
    pk: [...INFINITY]
  };
}

// Add player to card mask group
// pk_new = pk + G * player_secret
// If epk exists, msg_new = msg + epk * player_secret
export async function addPlayerToCardMask(card, playerSecret) {
  const playerPub = await secretToPublicKey(playerSecret);

  // new_pk = pk + player_pub
  let newPk;
  if (isInfinity(card.pk)) {
    newPk = playerPub;
  } else {
    newPk = await addPoints(card.pk, playerPub);
  }

  // If epk exists, msg_new = msg + epk * player_secret
  let newMsg;
  if (isInfinity(card.epk)) {
    newMsg = card.msg;
  } else {
    const epkScaled = await scalarMul(card.epk, playerSecret);
    newMsg = await addPoints(card.msg, epkScaled);
  }

  return {
    epk: card.epk,
    msg: newMsg,
    pk: newPk
  };
}

// Mask card with random nonce
// epk_new = epk + G * nonce
// msg_new = msg + pk * nonce
export async function maskCard(card, nonce) {
  if (isInfinity(card.pk)) {
    throw new Error('Cannot mask card with no players');
  }

  const ephemeralPub = await secretToPublicKey(nonce);

  // new_epk = epk + ephemeral_pub
  let newEpk;
  if (isInfinity(card.epk)) {
    newEpk = ephemeralPub;
  } else {
    newEpk = await addPoints(card.epk, ephemeralPub);
  }

  // new_msg = msg + pk * nonce
  const sharedSecret = await scalarMul(card.pk, nonce);
  const newMsg = await addPoints(card.msg, sharedSecret);

  return {
    epk: newEpk,
    msg: newMsg,
    pk: card.pk
  };
}

// Combined: add player and mask
export async function addPlayerAndMask(card, playerSecret, nonce) {
  const cardWithPlayer = await addPlayerToCardMask(card, playerSecret);
  return await maskCard(cardWithPlayer, nonce);
}

// Partial unmask (one player reveals their share)
// decryption_share = epk * player_secret
// msg_new = msg - decryption_share
// pk_new = pk - player_pub
export async function partialUnmask(card, playerSecret) {
  const playerPub = await secretToPublicKey(playerSecret);

  // decryption_share = epk * player_secret
  const decShare = await scalarMul(card.epk, playerSecret);

  // new_msg = msg - decryption_share
  const newMsg = await subPoints(card.msg, decShare);

  // new_pk = pk - player_pub
  const newPk = await subPoints(card.pk, playerPub);

  return {
    epk: card.epk,
    msg: newMsg,
    pk: newPk
  };
}

// Check if card is fully unmasked
export function isUnmasked(card) {
  return isInfinity(card.pk);
}
