#!/bin/bash
# Compile the reshuffle circuit separately (large circuit)

set -e

CIRCUITS_DIR="$(dirname "$0")/../circuits"
BUILD_DIR="$(dirname "$0")/../build"
PTAU_FILE="$BUILD_DIR/pot22_final.ptau"

mkdir -p "$BUILD_DIR"

# Download larger Powers of Tau if needed
if [ ! -f "$PTAU_FILE" ]; then
    echo "Downloading Powers of Tau (pot22)..."
    curl -L -o "$PTAU_FILE" https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_22.ptau
fi

circuit="reshuffle"
circuit_dir="$BUILD_DIR/$circuit"

echo "=========================================="
echo "Compiling reshuffle circuit"
echo "=========================================="

mkdir -p "$circuit_dir"

echo "Step 1: Compiling circuit..."
circom "$CIRCUITS_DIR/$circuit.circom" \
    --r1cs \
    --wasm \
    --sym \
    -o "$circuit_dir" \
    -l "$CIRCUITS_DIR/../node_modules" \
    --O2

echo "Step 2: Generating zkey..."
npx snarkjs groth16 setup \
    "$circuit_dir/$circuit.r1cs" \
    "$PTAU_FILE" \
    "$circuit_dir/${circuit}_0000.zkey"

echo "Step 3: Contributing to ceremony..."
npx snarkjs zkey contribute \
    "$circuit_dir/${circuit}_0000.zkey" \
    "$circuit_dir/${circuit}_0001.zkey" \
    --name="ZKPoker contribution" \
    -v -e="$(head -c 32 /dev/urandom | xxd -p)"

echo "Step 4: Finalizing zkey..."
mv "$circuit_dir/${circuit}_0001.zkey" "$circuit_dir/$circuit.zkey"

echo "Step 5: Exporting verification key..."
npx snarkjs zkey export verificationkey \
    "$circuit_dir/$circuit.zkey" \
    "$circuit_dir/${circuit}_vkey.json"

echo "Step 6: Exporting Solidity verifier..."
npx snarkjs zkey export solidityverifier \
    "$circuit_dir/$circuit.zkey" \
    "$circuit_dir/${circuit}_verifier.sol"

rm -f "$circuit_dir/${circuit}_0000.zkey"

echo "=========================================="
echo "Reshuffle circuit compiled!"
echo "=========================================="
