// Cryptographic primitives for ZK Poker (BabyJubJub + Poseidon)
import { buildBabyjub, buildPoseidon } from 'circomlibjs';

let babyjub = null;
let poseidon = null;
let F = null;

// Initialize crypto libraries
export async function initCrypto() {
  if (!babyjub) {
    console.log('[Crypto] Initializing BabyJubJub...');
    babyjub = await buildBabyjub();
  }
  if (!poseidon) {
    console.log('[Crypto] Initializing Poseidon...');
    poseidon = await buildPoseidon();
    F = poseidon.F;
  }
  console.log('[Crypto] Initialized');
  return { babyjub, poseidon };
}

// BabyJubJub curve parameters
export const SUBORDER = 2736030358979909402780800718157159386076813972158567259200215660948447373041n;

// BN254 field prime (for Circom/snarkjs)
export const FIELD_PRIME = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export const BASE8 = [
  5299619240641551281634865583518297030282874472190772894086521144482721001553n,
  16950150798460657717958625567821834550301663161624707787222815936182638968203n
];

// Field modular multiplication
export function fieldMul(a, b) {
  return (a * b) % FIELD_PRIME;
}

export const INFINITY = [0n, 1n];

// Generate random scalar
export function randomScalar() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let value = 0n;
  for (let i = 0; i < 32; i++) {
    value = (value << 8n) | BigInt(bytes[i]);
  }
  return value % SUBORDER;
}

// Generate keypair
export async function generateKeypair() {
  await initCrypto();
  const privateKey = randomScalar();
  const pub = babyjub.mulPointEscalar(babyjub.Base8, privateKey);
  const publicKey = [babyjub.F.toObject(pub[0]), babyjub.F.toObject(pub[1])];
  return { privateKey, publicKey };
}

// Scalar multiplication
export async function scalarMul(point, scalar) {
  await initCrypto();
  const result = babyjub.mulPointEscalar(
    [babyjub.F.e(point[0]), babyjub.F.e(point[1])],
    scalar
  );
  return [babyjub.F.toObject(result[0]), babyjub.F.toObject(result[1])];
}

// Point addition
export async function addPoints(p1, p2) {
  await initCrypto();
  const result = babyjub.addPoint(
    [babyjub.F.e(p1[0]), babyjub.F.e(p1[1])],
    [babyjub.F.e(p2[0]), babyjub.F.e(p2[1])]
  );
  return [babyjub.F.toObject(result[0]), babyjub.F.toObject(result[1])];
}

// Point subtraction
export async function subPoints(p1, p2) {
  await initCrypto();
  const negP2 = [babyjub.F.neg(babyjub.F.e(p2[0])), babyjub.F.e(p2[1])];
  const result = babyjub.addPoint(
    [babyjub.F.e(p1[0]), babyjub.F.e(p1[1])],
    negP2
  );
  return [babyjub.F.toObject(result[0]), babyjub.F.toObject(result[1])];
}

// Check if point is infinity
export function isInfinity(point) {
  return point[0] === 0n && point[1] === 1n;
}

// Secret to public key
export async function secretToPublicKey(secret) {
  await initCrypto();
  const pub = babyjub.mulPointEscalar(babyjub.Base8, secret);
  return [babyjub.F.toObject(pub[0]), babyjub.F.toObject(pub[1])];
}

// Poseidon hash
export async function hash(inputs) {
  await initCrypto();
  const result = poseidon(inputs.map(x => F.e(x)));
  return F.toObject(result);
}

// Card point from index (card i = (i+1) * G)
export async function cardIndexToPoint(index) {
  await initCrypto();
  return await scalarMul(BASE8, BigInt(index + 1));
}
