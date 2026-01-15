import { readFile } from 'fs/promises';
import { join } from 'path';
import * as snarkjs from 'snarkjs';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

export type CircuitType = 'shuffle' | 'reshuffle' | 'add_keys' | 'mask' | 'unmask' | 'game_action' | 'hand_eval' | 'showdown';

export interface VerificationResult {
  valid: boolean;
  error?: string;
}

// Cache for verification keys
const vkeyCache: Map<CircuitType, object> = new Map();

export class ProofVerifier {
  private circuitsPath: string;

  constructor() {
    this.circuitsPath = config.circuitsPath;
  }

  // Load verification key for a circuit
  private async loadVkey(circuitType: CircuitType): Promise<object> {
    if (vkeyCache.has(circuitType)) {
      return vkeyCache.get(circuitType)!;
    }

    const vkeyPath = join(this.circuitsPath, circuitType, `${circuitType}_vkey.json`);
    const vkeyData = await readFile(vkeyPath, 'utf-8');
    const vkey = JSON.parse(vkeyData);

    vkeyCache.set(circuitType, vkey);
    logger.info(`Loaded verification key for ${circuitType}`);

    return vkey;
  }

  // Verify a proof using snarkjs
  async verify(
    circuitType: CircuitType,
    proofJson: string,
    publicSignalsJson: string
  ): Promise<VerificationResult> {
    try {
      // Parse proof and public signals
      const proof = JSON.parse(proofJson);
      const publicSignals = JSON.parse(publicSignalsJson);

      // Load verification key
      const vkey = await this.loadVkey(circuitType);

      // Verify using snarkjs
      const startTime = Date.now();
      const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
      const elapsed = Date.now() - startTime;

      logger.info(`Verified ${circuitType} proof`, { valid, elapsed: `${elapsed}ms` });

      return { valid };
    } catch (error) {
      logger.error('Proof verification failed', { circuitType, error: String(error) });
      return { valid: false, error: String(error) };
    }
  }

  // Preload all verification keys at startup
  async preloadKeys(): Promise<void> {
    const circuits: CircuitType[] = ['shuffle', 'reshuffle', 'add_keys', 'mask', 'unmask', 'game_action', 'hand_eval', 'showdown'];

    for (const circuit of circuits) {
      try {
        await this.loadVkey(circuit);
      } catch (error) {
        logger.warn(`Failed to preload vkey for ${circuit}: ${error}`);
      }
    }
  }
}

export const proofVerifier = new ProofVerifier();
