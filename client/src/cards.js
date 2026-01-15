// Card encryption and deck operations for ZK Poker
import {
  initCrypto,
  randomScalar,
  scalarMul,
  addPoints,
  subPoints,
  secretToPublicKey,
  cardIndexToPoint,
  isInfinity,
  INFINITY,
  hash,
  fieldMul
} from './crypto.js';

// Card structure: { epk: [x, y], msg: [x, y], pk: [x, y] }

// Create unmasked card from index
export async function createCard(cardIndex) {
  const point = await cardIndexToPoint(cardIndex);
  return {
    epk: [...INFINITY],
    msg: point,
    pk: [...INFINITY]
  };
}

// Create initial deck (52 unmasked cards)
export async function createDeck() {
  const deck = [];
  for (let i = 0; i < 52; i++) {
    deck.push(await createCard(i));
  }
  return deck;
}

// Add player to card mask (updates pk, optionally msg if epk exists)
export async function addPlayerToCardMask(card, playerSecret) {
  const playerPub = await secretToPublicKey(playerSecret);

  let newPk;
  if (isInfinity(card.pk)) {
    newPk = playerPub;
  } else {
    newPk = await addPoints(card.pk, playerPub);
  }

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

// Mask card with nonce
export async function maskCard(card, nonce) {
  if (isInfinity(card.pk)) {
    throw new Error('Cannot mask card with no players');
  }

  const ephemeralPub = await secretToPublicKey(nonce);

  let newEpk;
  if (isInfinity(card.epk)) {
    newEpk = ephemeralPub;
  } else {
    newEpk = await addPoints(card.epk, ephemeralPub);
  }

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
export async function partialUnmask(card, playerSecret) {
  const playerPub = await secretToPublicKey(playerSecret);
  const decShare = await scalarMul(card.epk, playerSecret);
  const newMsg = await subPoints(card.msg, decShare);
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

// Shuffle and mask deck
export async function shuffleAndMaskDeck(deck, playerSecret) {
  // Generate permutation
  const n = deck.length;
  const permutation = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
  }

  // Generate nonces
  const nonces = [];
  for (let i = 0; i < n; i++) {
    nonces.push(randomScalar());
  }

  // Apply shuffle and mask
  const shuffledDeck = [];
  for (let i = 0; i < n; i++) {
    const originalCard = deck[permutation[i]];
    const maskedCard = await addPlayerAndMask(originalCard, playerSecret, nonces[i]);
    shuffledDeck.push(maskedCard);
  }

  return { shuffledDeck, permutation, nonces };
}

// Compute deck commitment (product of (hash(card) + 1) mod p)
// For circuit compatibility: uses (0,0) instead of INFINITY (0,1) for empty points
export async function commitDeck(deck) {
  let product = 1n;
  for (const card of deck) {
    // Convert INFINITY (0,1) to circuit's (0,0) representation
    const epkX = isInfinity(card.epk) ? 0n : card.epk[0];
    const epkY = isInfinity(card.epk) ? 0n : card.epk[1];
    const pkX = isInfinity(card.pk) ? 0n : card.pk[0];
    const pkY = isInfinity(card.pk) ? 0n : card.pk[1];

    const cardHash = await hash([
      epkX, epkY,
      card.msg[0], card.msg[1],
      pkX, pkY
    ]);
    product = fieldMul(product, cardHash + 1n);
  }
  return product;
}

// Compute deck commitment for unmasked cards (circuit format)
// Used for deckCommitmentBefore where all cards have epk=pk=(0,0)
export async function commitUnmaskedDeck(deck) {
  let product = 1n;
  for (const card of deck) {
    const cardHash = await hash([
      0n, 0n,                    // epk = (0, 0)
      card.msg[0], card.msg[1], // msg
      0n, 0n                     // pk = (0, 0)
    ]);
    product = fieldMul(product, cardHash + 1n);
  }
  return product;
}

// Commit card (matching circuit's CardCommitment template)
// Uses (0,0) for infinity points, not (0,1)
export async function commitCard(card) {
  // Convert INFINITY (0,1) to circuit's (0,0) representation
  const epkX = isInfinity(card.epk) ? 0n : card.epk[0];
  const epkY = isInfinity(card.epk) ? 0n : card.epk[1];
  const msgX = isInfinity(card.msg) ? 0n : card.msg[0];
  const msgY = isInfinity(card.msg) ? 0n : card.msg[1];
  const pkX = isInfinity(card.pk) ? 0n : card.pk[0];
  const pkY = isInfinity(card.pk) ? 0n : card.pk[1];

  return await hash([epkX, epkY, msgX, msgY, pkX, pkY]);
}

// Reshuffle and mask an already-masked deck (for player 2+)
// Unlike shuffleAndMaskDeck, this expects cards with existing masks
export async function reshuffleAndMaskDeck(deck, playerSecret) {
  const n = deck.length;

  // Generate permutation
  const permutation = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
  }

  // Generate nonces
  const nonces = [];
  for (let i = 0; i < n; i++) {
    nonces.push(randomScalar());
  }

  // Apply shuffle and additional masking
  const shuffledDeck = [];
  for (let i = 0; i < n; i++) {
    const originalCard = deck[permutation[i]];
    // addPlayerAndMask works for both unmasked and masked cards
    const maskedCard = await addPlayerAndMask(originalCard, playerSecret, nonces[i]);
    shuffledDeck.push(maskedCard);
  }

  return { shuffledDeck, permutation, nonces };
}

// Add player's public key to each card without shuffling or re-masking
// Simpler than reshuffling - just adds player's contribution to pk
// Note: This is a simplified protocol where msg stays unchanged (no re-encryption)
// The player's decryption share will be applied during unmask phase
export async function addPlayerKeysToDeck(deck, playerSecret) {
  const playerPub = await secretToPublicKey(playerSecret);
  const n = deck.length;

  // Track which cards had infinity pk before (for circuit)
  const pkIsInfBefore = [];
  const updatedDeck = [];

  for (let i = 0; i < n; i++) {
    const card = deck[i];
    const wasInfinity = isInfinity(card.pk);
    pkIsInfBefore.push(wasInfinity);

    // Update pk: pk_new = pk + player_pub
    let newPk;
    if (wasInfinity) {
      newPk = playerPub;
    } else {
      newPk = await addPoints(card.pk, playerPub);
    }

    // msg stays unchanged in add_keys circuit (no re-encryption)
    // The player's encryption contribution is tracked via pk accumulation
    // Copy arrays to avoid any reference issues
    updatedDeck.push({
      epk: [card.epk[0], card.epk[1]],
      msg: [card.msg[0], card.msg[1]],
      pk: newPk
    });
  }

  return { updatedDeck, pkIsInfBefore };
}
