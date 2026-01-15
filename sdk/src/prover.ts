// ZK Poker Prover
// Generates proofs using sunspot CLI

import { spawn } from 'child_process';
import type { ProofData } from './types.js';

// Circuit artifact paths
const CIRCUIT_NAMES = ['mask', 'unmask', 'shuffle', 'game_action'] as const;
type CircuitName = typeof CIRCUIT_NAMES[number];

export interface SunspotPaths {
  sunspotBin: string;
  targetDir: string;
}

export class ZKPokerProver {
  private paths: SunspotPaths;

  constructor(paths: SunspotPaths) {
    this.paths = paths;
  }

  private circuitPath(name: CircuitName, ext: string): string {
    return `${this.paths.targetDir}/circuit_${name}.${ext}`;
  }

  // Run sunspot command
  private async runSunspot(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.paths.sunspotBin, args);
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });
      proc.on('close', (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(`sunspot failed: ${stderr || stdout}`));
      });
    });
  }

  // Compile circuit (nargo + sunspot compile)
  async compile(name: CircuitName): Promise<void> {
    await this.runSunspot(['compile', this.circuitPath(name, 'json')]);
  }

  // Setup proving/verifying keys
  async setup(name: CircuitName): Promise<void> {
    await this.runSunspot(['setup', this.circuitPath(name, 'ccs')]);
  }

  // Generate proof
  async prove(name: CircuitName): Promise<void> {
    await this.runSunspot([
      'prove',
      this.circuitPath(name, 'json'),
      this.circuitPath(name, 'gz'),
      this.circuitPath(name, 'ccs'),
      this.circuitPath(name, 'pk'),
    ]);
  }

  // Verify proof
  async verify(name: CircuitName): Promise<boolean> {
    try {
      await this.runSunspot([
        'verify',
        this.circuitPath(name, 'vk'),
        this.circuitPath(name, 'proof'),
        this.circuitPath(name, 'pw'),
      ]);
      return true;
    } catch {
      return false;
    }
  }

  // Full prove workflow: compile -> setup -> prove -> verify
  async proveAndVerify(name: CircuitName): Promise<boolean> {
    await this.compile(name);
    await this.setup(name);
    await this.prove(name);
    return this.verify(name);
  }
}

// Helper: Convert bigint to Field string (hex)
export function toField(value: bigint): string {
  return '0x' + value.toString(16).padStart(64, '0');
}

// Helper: Split a bigint into lo and hi limbs (128 bits each)
export function splitScalar(scalar: bigint): { lo: string; hi: string } {
  const mask = (1n << 128n) - 1n;
  return {
    lo: toField(scalar & mask),
    hi: toField(scalar >> 128n),
  };
}

// Helper: Generate a random scalar
export function randomScalar(): bigint {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let scalar = 0n;
  for (let i = 0; i < 32; i++) {
    scalar = (scalar << 8n) | BigInt(bytes[i]);
  }
  // Reduce to valid scalar range (< field order)
  const fieldOrder = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  return scalar % fieldOrder;
}
