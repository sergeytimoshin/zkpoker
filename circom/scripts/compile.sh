#!/bin/bash
# Compile all Circom circuits and generate proving artifacts

set -e

CIRCUITS_DIR="$(dirname "$0")/../circuits"
BUILD_DIR="$(dirname "$0")/../build"
PTAU_FILE="$BUILD_DIR/pot20_final.ptau"

# Create build directory
mkdir -p "$BUILD_DIR"

# Download Powers of Tau if not present (pot20 supports up to 2^20 constraints)
if [ ! -f "$PTAU_FILE" ]; then
    echo "Downloading Powers of Tau (pot20)..."
    curl -L -o "$PTAU_FILE" https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_20.ptau
fi

# List of circuits to compile
CIRCUITS=(
    "mask"
    "unmask"
    "game_action"
    "hand_eval"
    "showdown"
    "add_keys"
    # "shuffle"  # Commented out - very large circuit, compile separately
    # "reshuffle"  # Commented out - very large circuit, compile separately
)

compile_circuit() {
    local circuit=$1
    local circuit_dir="$BUILD_DIR/$circuit"

    echo "=========================================="
    echo "Compiling: $circuit"
    echo "=========================================="

    mkdir -p "$circuit_dir"

    # Compile circuit
    echo "Step 1: Compiling circuit..."
    circom "$CIRCUITS_DIR/$circuit.circom" \
        --r1cs \
        --wasm \
        --sym \
        -o "$circuit_dir" \
        -l "$CIRCUITS_DIR/../node_modules"

    # Generate zkey
    echo "Step 2: Generating zkey (this may take a while)..."
    npx snarkjs groth16 setup \
        "$circuit_dir/$circuit.r1cs" \
        "$PTAU_FILE" \
        "$circuit_dir/${circuit}_0000.zkey"

    # Contribute to ceremony (for production, use real ceremony)
    echo "Step 3: Contributing to ceremony..."
    npx snarkjs zkey contribute \
        "$circuit_dir/${circuit}_0000.zkey" \
        "$circuit_dir/${circuit}_0001.zkey" \
        --name="ZKPoker contribution" \
        -v -e="$(head -c 32 /dev/urandom | xxd -p)"

    # Rename contributed zkey to final
    echo "Step 4: Finalizing zkey..."
    mv "$circuit_dir/${circuit}_0001.zkey" "$circuit_dir/$circuit.zkey"

    # Export verification key
    echo "Step 5: Exporting verification key..."
    npx snarkjs zkey export verificationkey \
        "$circuit_dir/$circuit.zkey" \
        "$circuit_dir/${circuit}_vkey.json"

    # Export Solidity verifier
    echo "Step 6: Exporting Solidity verifier..."
    npx snarkjs zkey export solidityverifier \
        "$circuit_dir/$circuit.zkey" \
        "$circuit_dir/${circuit}_verifier.sol"

    # Clean up intermediate files
    rm -f "$circuit_dir/${circuit}_0000.zkey"

    echo "Done: $circuit"
    echo ""
}

# Compile each circuit
for circuit in "${CIRCUITS[@]}"; do
    compile_circuit "$circuit"
done

echo "=========================================="
echo "All circuits compiled successfully!"
echo "Build artifacts in: $BUILD_DIR"
echo "=========================================="
echo ""
echo "Note: The shuffle circuit is commented out due to size."
echo "To compile shuffle, run:"
echo "  ./scripts/compile_shuffle.sh"
