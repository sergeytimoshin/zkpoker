/**
 * Grumpkin curve implementation for ZK Poker
 *
 * Grumpkin is the embedded curve for BN254 used in Noir circuits.
 * - Base field: Same as BN254 scalar field (Fr)
 * - Curve equation: y^2 = x^3 - 17
 * - Generator point: Standard BN254/Noir generator
 */
// Grumpkin curve parameters
// Base field (same as BN254 scalar field Fr)
export const FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
// Curve order (scalar field)
export const CURVE_ORDER = 21888242871839275222246405745257275088597320940842291287137428166847048758761n;
// Curve coefficient b in y^2 = x^3 + b (a = 0, b = -17)
const B = FIELD_MODULUS - 17n;
// Generator point (standard Grumpkin generator used by Noir)
export const GENERATOR = {
    x: 1n,
    y: 17631683881184975370165255887551781615748388533673675138860n,
};
/**
 * Create a scalar from a single bigint value
 */
export function scalarFromBigint(value) {
    const normalized = mod(value, CURVE_ORDER);
    const lo = normalized & ((1n << 128n) - 1n);
    const hi = normalized >> 128n;
    return { lo, hi };
}
/**
 * Convert scalar to bigint
 */
export function scalarToBigint(scalar) {
    return scalar.lo + (scalar.hi << 128n);
}
/**
 * Field modular reduction
 */
export function mod(n, p = FIELD_MODULUS) {
    const result = n % p;
    return result >= 0n ? result : result + p;
}
/**
 * Modular inverse using extended Euclidean algorithm
 */
export function modInverse(a, p = FIELD_MODULUS) {
    if (a === 0n)
        throw new Error("Cannot invert zero");
    a = mod(a, p);
    let [old_r, r] = [p, a];
    let [old_s, s] = [0n, 1n];
    while (r !== 0n) {
        const quotient = old_r / r;
        [old_r, r] = [r, old_r - quotient * r];
        [old_s, s] = [s, old_s - quotient * s];
    }
    if (old_r !== 1n)
        throw new Error("No modular inverse exists");
    return mod(old_s, p);
}
/**
 * Create point at infinity
 */
export function pointAtInfinity() {
    return { x: 0n, y: 0n, isInfinity: true };
}
/**
 * Create a point (validates it's on the curve)
 */
export function createPoint(x, y, validate = true) {
    if (x === 0n && y === 0n) {
        return pointAtInfinity();
    }
    const point = { x: mod(x), y: mod(y), isInfinity: false };
    if (validate && !isOnCurve(point)) {
        throw new Error(`Point (${x}, ${y}) is not on the Grumpkin curve`);
    }
    return point;
}
/**
 * Check if point is on the curve
 */
export function isOnCurve(point) {
    if (point.isInfinity)
        return true;
    const { x, y } = point;
    const lhs = mod(y * y);
    const rhs = mod(x * x * x + B);
    return lhs === rhs;
}
/**
 * Point negation
 */
export function negatePoint(p) {
    if (p.isInfinity)
        return p;
    return { x: p.x, y: mod(-p.y), isInfinity: false };
}
/**
 * Point addition using standard elliptic curve formulas
 */
export function addPoints(p1, p2) {
    if (p1.isInfinity)
        return p2;
    if (p2.isInfinity)
        return p1;
    // Check if points are negatives of each other
    if (p1.x === p2.x && mod(p1.y + p2.y) === 0n) {
        return pointAtInfinity();
    }
    let lambda;
    if (p1.x === p2.x && p1.y === p2.y) {
        // Point doubling: lambda = (3 * x^2) / (2 * y)
        const numerator = mod(3n * p1.x * p1.x);
        const denominator = mod(2n * p1.y);
        lambda = mod(numerator * modInverse(denominator));
    }
    else {
        // Point addition: lambda = (y2 - y1) / (x2 - x1)
        const numerator = mod(p2.y - p1.y);
        const denominator = mod(p2.x - p1.x);
        lambda = mod(numerator * modInverse(denominator));
    }
    // x3 = lambda^2 - x1 - x2
    const x3 = mod(lambda * lambda - p1.x - p2.x);
    // y3 = lambda * (x1 - x3) - y1
    const y3 = mod(lambda * (p1.x - x3) - p1.y);
    return { x: x3, y: y3, isInfinity: false };
}
/**
 * Point subtraction: P1 - P2 = P1 + (-P2)
 */
export function subtractPoints(p1, p2) {
    return addPoints(p1, negatePoint(p2));
}
/**
 * Scalar multiplication using double-and-add
 */
export function scalarMul(point, scalar) {
    const k = scalarToBigint(scalar);
    if (k === 0n || point.isInfinity) {
        return pointAtInfinity();
    }
    let result = pointAtInfinity();
    let current = point;
    let n = k;
    while (n > 0n) {
        if (n & 1n) {
            result = addPoints(result, current);
        }
        current = addPoints(current, current);
        n >>= 1n;
    }
    return result;
}
/**
 * Fixed base scalar multiplication: G * scalar
 */
export function fixedBaseScalarMul(scalar) {
    const generator = {
        x: GENERATOR.x,
        y: GENERATOR.y,
        isInfinity: false
    };
    return scalarMul(generator, scalar);
}
/**
 * Check if two points are equal
 */
export function pointsEqual(p1, p2) {
    if (p1.isInfinity && p2.isInfinity)
        return true;
    if (p1.isInfinity || p2.isInfinity)
        return false;
    return p1.x === p2.x && p1.y === p2.y;
}
//# sourceMappingURL=grumpkin.js.map