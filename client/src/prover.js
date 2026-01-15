// Browser-based Groth16 prover for ZK Poker
import * as snarkjs from 'snarkjs';

const BASE_PATH = '/circuits';

// Circuit artifacts cache
const circuits = {};

// Load a circuit's WASM and zkey
export async function loadCircuit(name) {
  if (circuits[name]) return circuits[name];

  const wasmPath = `${BASE_PATH}/${name}/${name}_js/${name}.wasm`;
  const zkeyPath = `${BASE_PATH}/${name}/${name}.zkey`;

  circuits[name] = { wasmPath, zkeyPath };
  console.log(`[Prover] Loaded circuit: ${name}`);
  return circuits[name];
}

// Load all circuits
export async function initProver() {
  console.log('[Prover] Initializing...');
  const circuitNames = [
    'mask', 'unmask', 'game_action', 'hand_eval', 'showdown',
    'shuffle', 'reshuffle', 'add_keys'
  ];

  for (const name of circuitNames) {
    await loadCircuit(name);
  }

  console.log('[Prover] All circuits loaded');
  return true;
}

// Generate a proof
export async function prove(circuitName, inputs) {
  const circuit = circuits[circuitName];
  if (!circuit) {
    throw new Error(`Circuit not loaded: ${circuitName}`);
  }

  console.log(`[Prover] Generating ${circuitName} proof...`);
  const startTime = performance.now();

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    inputs,
    circuit.wasmPath,
    circuit.zkeyPath
  );

  const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
  console.log(`[Prover] ${circuitName} proof generated in ${elapsed}s`);

  return { proof, publicSignals };
}

// Verify a proof locally (for testing)
export async function verify(circuitName, proof, publicSignals) {
  const vkeyPath = `${BASE_PATH}/${circuitName}/${circuitName}_vkey.json`;
  const vkey = await fetch(vkeyPath).then(r => r.json());
  return await snarkjs.groth16.verify(vkey, publicSignals, proof);
}

// Export proof for transmission
export function serializeProof(proof, publicSignals) {
  return {
    proof: JSON.stringify(proof),
    publicSignals: JSON.stringify(publicSignals)
  };
}
