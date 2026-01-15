// Minimal embedded curve test
use std::embedded_curve_ops::{EmbeddedCurvePoint, EmbeddedCurveScalar, fixed_base_scalar_mul};

fn main(
    scalar_lo: pub Field,
    scalar_hi: pub Field,
    expected_x: pub Field,
    expected_y: pub Field
) {
    let scalar = EmbeddedCurveScalar::new(scalar_lo, scalar_hi);
    let result = fixed_base_scalar_mul(scalar);

    assert(result.x == expected_x, "X mismatch");
    assert(result.y == expected_y, "Y mismatch");
}
