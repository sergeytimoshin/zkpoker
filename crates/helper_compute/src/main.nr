// Helper circuit to compute Merkle tree values for hand rankings
// Use `nargo execute` to compute Merkle root and proofs for depth-13 tree

use std::hash::pedersen_hash;

// Compute proof for 2 hands using a depth-13 tree
// We put the 2 hands in positions 0 and 1, rest are zeros
fn main(
    // Hand 1: [lookup_key, hand_rank, is_flush]
    p1_lookup_key: Field,
    p1_hand_rank: Field,
    p1_is_flush: Field,
    // Hand 2: [lookup_key, hand_rank, is_flush]
    p2_lookup_key: Field,
    p2_hand_rank: Field,
    p2_is_flush: Field,
) -> pub [Field; 30] {
    // Compute leaf hashes for both hands
    let leaf0 = pedersen_hash([p1_lookup_key, p1_hand_rank, p1_is_flush]);
    let leaf1 = pedersen_hash([p2_lookup_key, p2_hand_rank, p2_is_flush]);

    // Empty leaf hash (0, 0, 0)
    let empty_leaf = pedersen_hash([0, 0, 0]);

    // Build tree bottom-up for positions 0 and 1
    // Level 12 (2 leaves combine)
    let n12 = pedersen_hash([leaf0, leaf1]);

    // For remaining levels, we pair with empty subtrees
    // We need to compute the empty subtree hashes for each level
    let mut empty_subtrees: [Field; 13] = [0; 13];
    empty_subtrees[0] = empty_leaf;
    for i in 1..13 {
        empty_subtrees[i] = pedersen_hash([empty_subtrees[i-1], empty_subtrees[i-1]]);
    }

    // Now build path from leaves to root
    // Level 12: leaf0 + leaf1 = n12
    // Level 11: n12 + empty_n12 (positions 2-3 are empty)
    let n11 = pedersen_hash([n12, empty_subtrees[1]]);
    // Level 10 and up: combine with empty subtrees
    let n10 = pedersen_hash([n11, empty_subtrees[2]]);
    let n9 = pedersen_hash([n10, empty_subtrees[3]]);
    let n8 = pedersen_hash([n9, empty_subtrees[4]]);
    let n7 = pedersen_hash([n8, empty_subtrees[5]]);
    let n6 = pedersen_hash([n7, empty_subtrees[6]]);
    let n5 = pedersen_hash([n6, empty_subtrees[7]]);
    let n4 = pedersen_hash([n5, empty_subtrees[8]]);
    let n3 = pedersen_hash([n4, empty_subtrees[9]]);
    let n2 = pedersen_hash([n3, empty_subtrees[10]]);
    let n1 = pedersen_hash([n2, empty_subtrees[11]]);
    let root = pedersen_hash([n1, empty_subtrees[12]]);

    // Proof for leaf0 (position 0): path_bits = [false; 13] (all left)
    // Siblings: leaf1, empty_subtrees[1], empty_subtrees[2], ..., empty_subtrees[12]
    let proof_leaf0: [Field; 13] = [
        leaf1,
        empty_subtrees[1],
        empty_subtrees[2],
        empty_subtrees[3],
        empty_subtrees[4],
        empty_subtrees[5],
        empty_subtrees[6],
        empty_subtrees[7],
        empty_subtrees[8],
        empty_subtrees[9],
        empty_subtrees[10],
        empty_subtrees[11],
        empty_subtrees[12]
    ];

    // Proof for leaf1 (position 1): path_bits = [true, false, false, ..., false]
    // Siblings: leaf0, empty_subtrees[1], empty_subtrees[2], ..., empty_subtrees[12]
    let proof_leaf1: [Field; 13] = [
        leaf0,
        empty_subtrees[1],
        empty_subtrees[2],
        empty_subtrees[3],
        empty_subtrees[4],
        empty_subtrees[5],
        empty_subtrees[6],
        empty_subtrees[7],
        empty_subtrees[8],
        empty_subtrees[9],
        empty_subtrees[10],
        empty_subtrees[11],
        empty_subtrees[12]
    ];

    // Output:
    // [0] Merkle root
    // [1] leaf0 hash
    // [2] leaf1 hash
    // [3-15] proof for leaf0 (13 elements)
    // [16-28] proof for leaf1 (13 elements)
    // [29] padding
    [
        root,
        leaf0,
        leaf1,
        proof_leaf0[0], proof_leaf0[1], proof_leaf0[2], proof_leaf0[3],
        proof_leaf0[4], proof_leaf0[5], proof_leaf0[6], proof_leaf0[7],
        proof_leaf0[8], proof_leaf0[9], proof_leaf0[10], proof_leaf0[11], proof_leaf0[12],
        proof_leaf1[0], proof_leaf1[1], proof_leaf1[2], proof_leaf1[3],
        proof_leaf1[4], proof_leaf1[5], proof_leaf1[6], proof_leaf1[7],
        proof_leaf1[8], proof_leaf1[9], proof_leaf1[10], proof_leaf1[11], proof_leaf1[12],
        0
    ]
}
