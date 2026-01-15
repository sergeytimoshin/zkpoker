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
import { Point } from "./grumpkin.js";
export declare const PEDERSEN_GENERATORS: Point[];
export declare const PEDERSEN_LENGTH_GENERATOR: Point;
/**
 * Pedersen hash of field elements
 * Compatible with Noir's std::hash::pedersen_hash
 *
 * H = sum(input[i] * G_i) + N * G_length
 *
 * Returns only the x-coordinate as the hash output (Noir convention)
 */
export declare function pedersenHash(inputs: bigint[]): bigint;
/**
 * Pedersen commitment (returns full point)
 */
export declare function pedersenCommit(inputs: bigint[]): Point;
//# sourceMappingURL=pedersen.d.ts.map