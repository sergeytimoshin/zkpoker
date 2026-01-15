// Combined test: EC scalar mul + Pedersen hash
use std::embedded_curve_ops::{EmbeddedCurveScalar, fixed_base_scalar_mul};
use std::hash::pedersen_hash;

fn main(
    // Compute G * scalar, hash the result
    scalar_lo: Field,
    scalar_hi: Field
) -> pub Field {
    let scalar = EmbeddedCurveScalar::new(scalar_lo, scalar_hi);
    let point = fixed_base_scalar_mul(scalar);

    // Hash the point coordinates
    pedersen_hash([point.x, point.y])
}
