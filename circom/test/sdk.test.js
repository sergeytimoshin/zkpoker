// Basic SDK tests

import { expect } from 'chai';
import {
  init as initBabyjub,
  generateKeypair,
  scalarMul,
  addPoints,
  subPoints,
  secretToPublicKey,
  randomScalar,
  isInfinity,
  BASE8,
  INFINITY
} from '../sdk/babyjub.js';

import {
  createCard,
  addPlayerToCardMask,
  maskCard,
  addPlayerAndMask,
  partialUnmask,
  isUnmasked
} from '../sdk/elgamal.js';

import {
  createDeck,
  cardIndexToPoint,
  cardToString,
  findCardFromPoint,
  precomputeCardPoints
} from '../sdk/card.js';

import {
  init as initPoseidon,
  hash,
  hash2,
  commitCard,
  commitGameState,
  buildMerkleTree,
  getMerkleProof,
  verifyMerkleProof
} from '../sdk/poseidon.js';

describe('BabyJubJub', function() {
  this.timeout(10000);

  before(async () => {
    await initBabyjub();
  });

  it('should generate keypair', async () => {
    const kp = await generateKeypair();
    expect(kp.privateKey).to.be.a('bigint');
    expect(kp.publicKey).to.be.an('array').with.lengthOf(2);
  });

  it('should compute public key from secret', async () => {
    const secret = 12345n;
    const pub = await secretToPublicKey(secret);
    expect(pub[0]).to.be.a('bigint');
    expect(pub[1]).to.be.a('bigint');
  });

  it('should add and subtract points', async () => {
    const p1 = await secretToPublicKey(100n);
    const p2 = await secretToPublicKey(200n);
    const sum = await addPoints(p1, p2);
    const diff = await subPoints(sum, p2);
    expect(diff[0]).to.equal(p1[0]);
    expect(diff[1]).to.equal(p1[1]);
  });

  it('should verify infinity point', () => {
    expect(isInfinity(INFINITY)).to.be.true;
    expect(isInfinity([1n, 2n])).to.be.false;
  });
});

describe('ElGamal', function() {
  this.timeout(10000);

  it('should create unmasked card', async () => {
    const point = await cardIndexToPoint(0);
    const card = createCard(point);
    expect(isInfinity(card.epk)).to.be.true;
    expect(isInfinity(card.pk)).to.be.true;
    expect(card.msg[0]).to.equal(point[0]);
    expect(card.msg[1]).to.equal(point[1]);
  });

  it('should mask and unmask card', async () => {
    const point = await cardIndexToPoint(0);
    const card = createCard(point);

    const secret1 = 11111n;
    const nonce1 = 22222n;

    // Player 1 masks
    const masked = await addPlayerAndMask(card, secret1, nonce1);
    expect(isUnmasked(masked)).to.be.false;

    // Player 1 unmasks
    const unmasked = await partialUnmask(masked, secret1);
    expect(isUnmasked(unmasked)).to.be.true;
    expect(unmasked.msg[0]).to.equal(point[0]);
    expect(unmasked.msg[1]).to.equal(point[1]);
  });

  it('should handle two-player mask/unmask', async () => {
    const point = await cardIndexToPoint(5);
    let card = createCard(point);

    const secret1 = 11111n;
    const secret2 = 22222n;
    const nonce1 = 33333n;
    const nonce2 = 44444n;

    // Player 1 masks
    card = await addPlayerAndMask(card, secret1, nonce1);

    // Player 2 masks
    card = await addPlayerAndMask(card, secret2, nonce2);

    // Player 1 unmasks
    card = await partialUnmask(card, secret1);
    expect(isUnmasked(card)).to.be.false;

    // Player 2 unmasks
    card = await partialUnmask(card, secret2);
    expect(isUnmasked(card)).to.be.true;
    expect(card.msg[0]).to.equal(point[0]);
    expect(card.msg[1]).to.equal(point[1]);
  });
});

describe('Card', function() {
  this.timeout(30000);

  it('should create deck of 52 cards', async () => {
    const deck = await createDeck();
    expect(deck).to.have.lengthOf(52);
    expect(isUnmasked(deck[0])).to.be.true;
  });

  it('should find card from point', async () => {
    const points = await precomputeCardPoints();
    const foundIdx = await findCardFromPoint(points[25], points);
    expect(foundIdx).to.equal(25);
  });

  it('should convert card index to string', () => {
    expect(cardToString(0)).to.equal('2c');
    expect(cardToString(12)).to.equal('Ac');
    expect(cardToString(13)).to.equal('2d');
    expect(cardToString(51)).to.equal('As');
  });
});

describe('Poseidon', function() {
  this.timeout(10000);

  before(async () => {
    await initPoseidon();
  });

  it('should hash values', async () => {
    const h1 = await hash([1n, 2n, 3n]);
    const h2 = await hash([1n, 2n, 3n]);
    const h3 = await hash([1n, 2n, 4n]);
    expect(h1).to.equal(h2);
    expect(h1).to.not.equal(h3);
  });

  it('should commit game state', async () => {
    const state = {
      stackP1: 1000,
      stackP2: 1000,
      pot: 0,
      street: 0,
      currentPlayer: 0,
      lastAction: 0,
      lastBetSize: 0,
      streetBetP1: 0,
      streetBetP2: 0,
      status: 0,
      dealer: 0
    };
    const commitment = await commitGameState(state);
    expect(commitment).to.be.a('bigint');
  });

  it('should build and verify Merkle tree', async () => {
    const leaves = [1n, 2n, 3n, 4n];
    const tree = await buildMerkleTree(leaves);

    // Verify proof for leaf at index 2
    const { pathElements, pathIndices, root } = getMerkleProof(tree, 2);
    const valid = await verifyMerkleProof(leaves[2], pathElements, pathIndices, root);
    expect(valid).to.be.true;

    // Invalid proof should fail
    const invalid = await verifyMerkleProof(999n, pathElements, pathIndices, root);
    expect(invalid).to.be.false;
  });
});
