use std::hash::{pedersen_hash, pedersen_commitment};
use std::hash::derive_generators;
use std::embedded_curve_ops::EmbeddedCurvePoint;

fn main(_input: pub Field) {
    // Print generators G0-G11 by using derive_generators directly
    let generators: [EmbeddedCurvePoint; 12] = derive_generators("DEFAULT_DOMAIN_SEPARATOR".as_bytes(), 0);

    println("=== Default Generators (G0-G11) ===");
    for i in 0..12 {
        println(generators[i].x);
        println(generators[i].y);
    }

    // Print length generator
    let length_gen: [EmbeddedCurvePoint; 1] = derive_generators("pedersen_hash_length".as_bytes(), 0);
    println("=== Length Generator ===");
    println(length_gen[0].x);
    println(length_gen[0].y);

    // Verify hash formula: H = sum(input[i] * G_i) + N * G_length
    println("=== Hash Tests ===");

    // hash([1])
    let h1 = pedersen_hash([1]);
    let c1 = pedersen_commitment([1]);
    println("hash([1]):");
    println(h1);
    println("commitment([1]).x:");
    println(c1.x);

    // hash([1,2])
    let h12 = pedersen_hash([1, 2]);
    let c12 = pedersen_commitment([1, 2]);
    println("hash([1,2]):");
    println(h12);
    println("commitment([1,2]).x:");
    println(c12.x);

    // Test with 11 elements (the game state size)
    let h11 = pedersen_hash([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    println("hash([1..11]):");
    println(h11);
}
