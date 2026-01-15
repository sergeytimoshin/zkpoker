#!/bin/bash
# Compile the shuffle circuit separately (large circuit)

set -e

CIRCUITS_DIR="$(dirname "$0")/../circuits"
BUILD_DIR="$(dirname "$0")/../build"
PTAU_FILE="$BUILD_DIR/pot22_final.ptau"

# Create build directory
mkdir -p "$BUILD_DIR"

# Download larger Powers of Tau for shuffle (pot22 supports up to 2^22 constraints)
# Shuffle has ~740k constraints, needs pot20 minimum
if [ ! -f "$PTAU_FILE" ]; then
    echo "Downloading Powers of Tau (pot22) for shuffle..."
    curl -L -o "$PTAU_FILE" https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_22.ptau
fi

circuit="shuffle"
circuit_dir="$BUILD_DIR/$circuit"

echo "=========================================="
echo "Compiling shuffle circuit (this will take a long time)"
echo "=========================================="

mkdir -p "$circuit_dir"

# Compile circuit
echo "Step 1: Compiling circuit..."
circom "$CIRCUITS_DIR/$circuit.circom" \
    --r1cs \
    --wasm \
    --sym \
    -o "$circuit_dir" \
    -l "$CIRCUITS_DIR/../node_modules" \
    --O2

# Generate zkey
echo "Step 2: Generating zkey (this will take 10-30 minutes)..."
npx snarkjs groth16 setup \
    "$circuit_dir/$circuit.r1cs" \
    "$PTAU_FILE" \
    "$circuit_dir/${circuit}_0000.zkey"

# Contribute to ceremony
echo "Step 3: Contributing to ceremony..."
npx snarkjs zkey contribute \
    "$circuit_dir/${circuit}_0000.zkey" \
    "$circuit_dir/${circuit}_0001.zkey" \
    --name="ZKPoker contribution" \
    -v -e="$(head -c 32 /dev/urandom | xxd -p)"

# Finalize
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

# Clean up
rm -f "$circuit_dir/${circuit}_0000.zkey"

echo "=========================================="
echo "Shuffle circuit compiled successfully!"
echo "Build artifacts in: $circuit_dir"
echo "=========================================="
