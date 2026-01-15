// Poseidon hash wrapper for ZK Poker
// Used for commitments and Merkle proofs

import { buildPoseidon } from 'circomlibjs';

let poseidon = null;
let F = null;

export async function init() {
  if (!poseidon) {
    poseidon = await buildPoseidon();
    F = poseidon.F;
  }
  return poseidon;
}

// Hash arbitrary number of field elements
export async function hash(inputs) {
  const p = await init();
  const result = p(inputs.map(x => F.e(x)));
  return F.toObject(result);
}

// Hash 2 elements (common case)
export async function hash2(a, b) {
  return hash([a, b]);
}

// Hash 3 elements
export async function hash3(a, b, c) {
  return hash([a, b, c]);
}

// Card commitment: Poseidon(epk.x, epk.y, msg.x, msg.y, pk.x, pk.y)
export async function commitCard(card) {
  return hash([
    card.epk[0],
    card.epk[1],
    card.msg[0],
    card.msg[1],
    card.pk[0],
    card.pk[1]
  ]);
}

// Game state commitment: Poseidon(stackP1, stackP2, pot, street, currentPlayer,
//                                 lastAction, lastBetSize, streetBetP1, streetBetP2, status, dealer)
export async function commitGameState(state) {
  return hash([
    BigInt(state.stackP1),
    BigInt(state.stackP2),
    BigInt(state.pot),
    BigInt(state.street),
    BigInt(state.currentPlayer),
    BigInt(state.lastAction),
    BigInt(state.lastBetSize),
    BigInt(state.streetBetP1),
    BigInt(state.streetBetP2),
    BigInt(state.status),
    BigInt(state.dealer)
  ]);
}

// Deck commitment: product of (card_hash + 1) for all cards
export async function commitDeck(cards) {
  let product = 1n;
  for (const card of cards) {
    const cardHash = await commitCard(card);
    product = product * (cardHash + 1n);
  }
  return product;
}

// Hole cards commitment: Poseidon(card0, card1)
export async function commitHoleCards(card0Index, card1Index) {
  return hash2(BigInt(card0Index), BigInt(card1Index));
}

// Board cards commitment: Poseidon(card0, card1, card2, card3, card4)
export async function commitBoardCards(cardIndices) {
  return hash(cardIndices.map(BigInt));
}

// Merkle proof verification
export async function verifyMerkleProof(leaf, pathElements, pathIndices, root) {
  let current = leaf;
  for (let i = 0; i < pathElements.length; i++) {
    if (pathIndices[i] === 0) {
      current = await hash2(current, pathElements[i]);
    } else {
      current = await hash2(pathElements[i], current);
    }
  }
  return current === root;
}

// Build Merkle tree from leaves
export async function buildMerkleTree(leaves) {
  if (leaves.length === 0) {
    throw new Error('Cannot build Merkle tree from empty leaves');
  }

  // Pad to power of 2
  let paddedLeaves = [...leaves];
  while ((paddedLeaves.length & (paddedLeaves.length - 1)) !== 0) {
    paddedLeaves.push(0n);
  }

  const tree = [paddedLeaves];
  let currentLevel = paddedLeaves;

  while (currentLevel.length > 1) {
    const nextLevel = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const parent = await hash2(currentLevel[i], currentLevel[i + 1]);
      nextLevel.push(parent);
    }
    tree.push(nextLevel);
    currentLevel = nextLevel;
  }

  return tree;
}

// Get Merkle proof for leaf at index
export function getMerkleProof(tree, leafIndex) {
  const pathElements = [];
  const pathIndices = [];

  let idx = leafIndex;
  for (let level = 0; level < tree.length - 1; level++) {
    const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
    pathElements.push(tree[level][siblingIdx]);
    pathIndices.push(idx % 2);
    idx = Math.floor(idx / 2);
  }

  return { pathElements, pathIndices, root: tree[tree.length - 1][0] };
}
