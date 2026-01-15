import { proofVerifier, type CircuitType, type VerificationResult } from './ProofVerifier.js';
import { logger } from '../utils/logger.js';

interface QueuedProof {
  id: string;
  circuitType: CircuitType;
  proof: string;
  publicWitness: string;
  onComplete: (result: VerificationResult) => void;
  timestamp: number;
}

export class ProofQueue {
  private queue: QueuedProof[] = [];
  private processing: boolean = false;
  private maxConcurrent: number = 2;
  private activeCount: number = 0;

  enqueue(
    id: string,
    circuitType: CircuitType,
    proof: string,
    publicWitness: string,
    onComplete: (result: VerificationResult) => void
  ): void {
    this.queue.push({
      id,
      circuitType,
      proof,
      publicWitness,
      onComplete,
      timestamp: Date.now(),
    });

    logger.debug('Proof queued', { id, circuitType, queueSize: this.queue.length });
    this.processNext();
  }

  private async processNext(): Promise<void> {
    if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift();
    if (!item) return;

    this.activeCount++;

    try {
      logger.debug('Processing proof', { id: item.id, circuitType: item.circuitType });

      const result = await proofVerifier.verify(
        item.circuitType,
        item.proof,
        item.publicWitness
      );

      const duration = Date.now() - item.timestamp;
      logger.info('Proof verified', {
        id: item.id,
        circuitType: item.circuitType,
        valid: result.valid,
        durationMs: duration,
      });

      item.onComplete(result);
    } catch (error) {
      logger.error('Proof processing error', { id: item.id, error: String(error) });
      item.onComplete({ valid: false, error: String(error) });
    } finally {
      this.activeCount--;
      this.processNext();
    }
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  getActiveCount(): number {
    return this.activeCount;
  }

  clear(): void {
    this.queue = [];
  }
}

export const proofQueue = new ProofQueue();
