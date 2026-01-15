// Minimal reproducer for infinity point bug
// This circuit takes an infinity point and verifies a simple property

use std::embedded_curve_ops::{EmbeddedCurvePoint, EmbeddedCurveScalar, multi_scalar_mul};

fn main(
    // Input point (will be infinity in our test)
    point_x: Field,
    point_y: Field,
    point_is_inf: bool,

    // A scalar to multiply by
    scalar_lo: Field,
    scalar_hi: Field,

    // Expected output (public)
    output_x: pub Field,
    output_y: pub Field,
    output_is_inf: pub bool,
) {
    // Reconstruct the point
    let point = EmbeddedCurvePoint { x: point_x, y: point_y, is_infinite: point_is_inf };

    // Compute [scalar] * point
    let scalar = EmbeddedCurveScalar::new(scalar_lo, scalar_hi);
    let result = multi_scalar_mul([point], [scalar]);

    // Verify output matches
    assert(result.x == output_x, "output x mismatch");
    assert(result.y == output_y, "output y mismatch");
    assert(result.is_infinite == output_is_inf, "output is_infinite mismatch");
}
