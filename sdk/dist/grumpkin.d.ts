/**
 * Grumpkin curve implementation for ZK Poker
 *
 * Grumpkin is the embedded curve for BN254 used in Noir circuits.
 * - Base field: Same as BN254 scalar field (Fr)
 * - Curve equation: y^2 = x^3 - 17
 * - Generator point: Standard BN254/Noir generator
 */
export declare const FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export declare const CURVE_ORDER = 21888242871839275222246405745257275088597320940842291287137428166847048758761n;
export declare const GENERATOR: {
    x: bigint;
    y: bigint;
};
/**
 * Point on the Grumpkin curve
 */
export interface Point {
    x: bigint;
    y: bigint;
    isInfinity: boolean;
}
/**
 * Scalar for curve operations (represented as two 128-bit limbs for Noir compatibility)
 */
export interface Scalar {
    lo: bigint;
    hi: bigint;
}
/**
 * Create a scalar from a single bigint value
 */
export declare function scalarFromBigint(value: bigint): Scalar;
/**
 * Convert scalar to bigint
 */
export declare function scalarToBigint(scalar: Scalar): bigint;
/**
 * Field modular reduction
 */
export declare function mod(n: bigint, p?: bigint): bigint;
/**
 * Modular inverse using extended Euclidean algorithm
 */
export declare function modInverse(a: bigint, p?: bigint): bigint;
/**
 * Create point at infinity
 */
export declare function pointAtInfinity(): Point;
/**
 * Create a point (validates it's on the curve)
 */
export declare function createPoint(x: bigint, y: bigint, validate?: boolean): Point;
/**
 * Check if point is on the curve
 */
export declare function isOnCurve(point: Point): boolean;
/**
 * Point negation
 */
export declare function negatePoint(p: Point): Point;
/**
 * Point addition using standard elliptic curve formulas
 */
export declare function addPoints(p1: Point, p2: Point): Point;
/**
 * Point subtraction: P1 - P2 = P1 + (-P2)
 */
export declare function subtractPoints(p1: Point, p2: Point): Point;
/**
 * Scalar multiplication using double-and-add
 */
export declare function scalarMul(point: Point, scalar: Scalar): Point;
/**
 * Fixed base scalar multiplication: G * scalar
 */
export declare function fixedBaseScalarMul(scalar: Scalar): Point;
/**
 * Check if two points are equal
 */
export declare function pointsEqual(p1: Point, p2: Point): boolean;
//# sourceMappingURL=grumpkin.d.ts.map