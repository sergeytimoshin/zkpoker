// BabyJubJub curve operations for browser-based ZK Poker
// This replaces the Grumpkin curve from the Noir SDK

import { buildBabyjub } from 'circomlibjs';

let babyjub = null;

export async function init() {
  if (!babyjub) {
    babyjub = await buildBabyjub();
  }
  return babyjub;
}

// BabyJubJub curve parameters
export const SUBORDER = 2736030358979909402780800718157159386076813972158567259200215660948447373041n;

// Base point (generator)
export const BASE8 = [
  5299619240641551281634865583518297030282874472190772894086521144482721001553n,
  16950150798460657717958625567821834550301663161624707787222815936182638968203n
];

// Point at infinity representation
export const INFINITY = [0n, 1n];

// Generate keypair
export async function generateKeypair() {
  const bj = await init();

  // Random scalar
  const privateKey = randomScalar();

  // Public key = privateKey * G
  const publicKey = bj.mulPointEscalar(bj.Base8, privateKey);

  return {
    privateKey,
    publicKey: [bj.F.toObject(publicKey[0]), bj.F.toObject(publicKey[1])]
  };
}

// Scalar multiplication: point * scalar
export async function scalarMul(point, scalar) {
  const bj = await init();
  const result = bj.mulPointEscalar(
    [bj.F.e(point[0]), bj.F.e(point[1])],
    scalar
  );
  return [bj.F.toObject(result[0]), bj.F.toObject(result[1])];
}

// Point addition
export async function addPoints(p1, p2) {
  const bj = await init();
  const result = bj.addPoint(
    [bj.F.e(p1[0]), bj.F.e(p1[1])],
    [bj.F.e(p2[0]), bj.F.e(p2[1])]
  );
  return [bj.F.toObject(result[0]), bj.F.toObject(result[1])];
}

// Point subtraction: p1 - p2 = p1 + (-p2)
// On twisted Edwards, -P = (-x, y)
export async function subPoints(p1, p2) {
  const bj = await init();
  const negP2 = [bj.F.neg(bj.F.e(p2[0])), bj.F.e(p2[1])];
  const result = bj.addPoint(
    [bj.F.e(p1[0]), bj.F.e(p1[1])],
    negP2
  );
  return [bj.F.toObject(result[0]), bj.F.toObject(result[1])];
}

// Check if point is at infinity (identity)
export function isInfinity(point) {
  return point[0] === 0n && point[1] === 1n;
}

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

// Secret to public key
export async function secretToPublicKey(secret) {
  const bj = await init();
  const pub = bj.mulPointEscalar(bj.Base8, secret);
  return [bj.F.toObject(pub[0]), bj.F.toObject(pub[1])];
}
