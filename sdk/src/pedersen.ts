/**
 * Pedersen hash implementation compatible with Noir
 *
 * The generators are derived from Noir's source code:
 * - acvm-repo/bn254_blackbox_solver/src/generator/generators.rs
 * - noir_stdlib/src/hash/mod.nr
 *
 * Noir's pedersen_hash formula:
 *   H = sum(input[i] * G_i) + N * G_length
 * where N is the input length and G_length is a special generator.
 */

import {
  Point,
  Scalar,
  FIELD_MODULUS,
  mod,
  addPoints,
  scalarMul,
  pointAtInfinity,
  scalarFromBigint,
} from "./grumpkin.js";

// Default generators derived from "DEFAULT_DOMAIN_SEPARATOR" via hash-to-curve
// From acvm-repo/bn254_blackbox_solver/src/generator/generators.rs tests
export const PEDERSEN_GENERATORS: Point[] = [
  {
    // G0: 0x083e7911d835097629f0067531fc15cafd79a89beecb39903f69572c636f4a5a
    x: 0x083e7911d835097629f0067531fc15cafd79a89beecb39903f69572c636f4a5an,
    y: 0x1a7f5efaad7f315c25a918f30cc8d7333fccab7ad7c90f14de81bcc528f9935dn,
    isInfinity: false,
  },
  {
    // G1: 0x054aa86a73cb8a34525e5bbed6e43ba1198e860f5f3950268f71df4591bde402
    x: 0x054aa86a73cb8a34525e5bbed6e43ba1198e860f5f3950268f71df4591bde402n,
    y: 0x209dcfbf2cfb57f9f6046f44d71ac6faf87254afc7407c04eb621a6287cac126n,
    isInfinity: false,
  },
  {
    // G2
    x: 0x1c44f2a5207c81c28a8321a5815ce8b1311024bbed131819bbdaf5a2ada84748n,
    y: 0x03aaee36e6422a1d0191632ac6599ae9eba5ac2c17a8c920aa3caf8b89c5f8a8n,
    isInfinity: false,
  },
  {
    // G3
    x: 0x26d8b1160c6821a30c65f6cb47124afe01c29f4338f44d4a12c9fccf22fb6fb2n,
    y: 0x05c70c3b9c0d25a4c100e3a27bf3cc375f8af8cdd9498ec4089a823d7464caffn,
    isInfinity: false,
  },
  {
    // G4
    x: 0x20ed9c6a1d27271c4498bfce0578d59db1adbeaa8734f7facc097b9b994fcf6en,
    y: 0x29cd7d370938b358c62c4a00f73a0d10aba7e5aaa04704a0713f891ebeb92371n,
    isInfinity: false,
  },
  {
    // G5
    x: 0x0224a8abc6c8b8d50373d64cd2a1ab1567bf372b3b1f7b861d7f01257052d383n,
    y: 0x2358629b90eafb299d6650a311e79914b0215eb0a790810b26da5a826726d711n,
    isInfinity: false,
  },
  {
    // G6
    x: 0x0f106f6d46bc904a5290542490b2f238775ff3c445b2f8f704c466655f460a2an,
    y: 0x29ab84d472f1d33f42fe09c47b8f7710f01920d6155250126731e486877bcf27n,
    isInfinity: false,
  },
  {
    // G7
    x: 0x0298f2e42249f0519c8a8abd91567ebe016e480f219b8c19461d6a595cc33696n,
    y: 0x035bec4b8520a4ece27bd5aafabee3dfe1390d7439c419a8c55aceb207aac83bn,
    isInfinity: false,
  },
  {
    // G8
    x: 0x2c9628479de4181ea77e7b0913ccf41d2a74155b1d9c82eaa220c218781f6f3bn,
    y: 0x278f86b8fd95520b5da23bee1a5e354dc5dcb0cb43d6b76e628ddbffb101d776n,
    isInfinity: false,
  },
  {
    // G9
    x: 0x0be1916f382e3532aa53a766fe74b1a983784caab90290aea7bf616bc371fb41n,
    y: 0x0f65545005e896f14249956344faf9addd762b7573a487b58f805a361d920a20n,
    isInfinity: false,
  },
  {
    // G10
    x: 0x29ff8437ae5bec89981441b23036a22b7fd5bee9eff0e83c0dd5b87bfb5bd60en,
    y: 0x1fd247352b77e2676b22db23cf7cd482474f543e3480b5a39c42f839a306be10n,
    isInfinity: false,
  },
  {
    // G11
    x: 0x2f3bd4e98f8c8458cd58888749f0f5e582a43565767398e08e50e94b9b19a4d9n,
    y: 0x1f534906d1aa8b4ba74ad9e3f85ae3f8295e51eaafd15b5d116801b96360205bn,
    isInfinity: false,
  },
];

// Length generator derived from "pedersen_hash_length" domain separator
// Used by pedersen_hash to encode the input length: H += N * G_length
export const PEDERSEN_LENGTH_GENERATOR: Point = {
  x: 0x2df8b940e5890e4e1377e05373fae69a1d754f6935e6a780b666947431f2cdcdn,
  y: 0x2ecd88d15967bc53b885912e0d16866154acb6aac2d3f85e27ca7eefb2c19083n,
  isInfinity: false,
};

/**
 * Pedersen hash of field elements
 * Compatible with Noir's std::hash::pedersen_hash
 *
 * H = sum(input[i] * G_i) + N * G_length
 *
 * Returns only the x-coordinate as the hash output (Noir convention)
 */
export function pedersenHash(inputs: bigint[]): bigint {
  if (inputs.length > PEDERSEN_GENERATORS.length) {
    throw new Error(
      `Pedersen hash supports up to ${PEDERSEN_GENERATORS.length} inputs, got ${inputs.length}`
    );
  }

  let result = pointAtInfinity();

  // Add input[i] * G_i for each input
  for (let i = 0; i < inputs.length; i++) {
    const scalar = scalarFromBigint(mod(inputs[i]));
    const term = scalarMul(PEDERSEN_GENERATORS[i], scalar);
    result = addPoints(result, term);
  }

  // Add length term: N * G_length (this is what makes pedersen_hash different from pedersen_commitment)
  const lengthScalar = scalarFromBigint(BigInt(inputs.length));
  const lengthTerm = scalarMul(PEDERSEN_LENGTH_GENERATOR, lengthScalar);
  result = addPoints(result, lengthTerm);

  // Return x-coordinate as hash (Noir convention)
  return result.isInfinity ? 0n : result.x;
}

/**
 * Pedersen commitment (returns full point)
 */
export function pedersenCommit(inputs: bigint[]): Point {
  if (inputs.length > PEDERSEN_GENERATORS.length) {
    throw new Error(
      `Pedersen commit supports up to ${PEDERSEN_GENERATORS.length} inputs, got ${inputs.length}`
    );
  }

  let result = pointAtInfinity();

  for (let i = 0; i < inputs.length; i++) {
    const scalar = scalarFromBigint(mod(inputs[i]));
    const term = scalarMul(PEDERSEN_GENERATORS[i], scalar);
    result = addPoints(result, term);
  }

  return result;
}
