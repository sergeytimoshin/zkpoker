// Test: pre-computed EC point fed into Pedersen (works in Pedersen test)
use std::hash::pedersen_hash;

fn main(
    // Pre-computed G * 42 point
    point_x: Field,
    point_y: Field
) -> pub Field {
    // Hash the point coordinates (should match standalone Pedersen test)
    pedersen_hash([point_x, point_y])
}
