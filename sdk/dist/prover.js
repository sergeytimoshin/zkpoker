// ZK Poker Prover
// Generates proofs using sunspot CLI
import { spawn } from 'child_process';
// Circuit artifact paths
const CIRCUIT_NAMES = ['mask', 'unmask', 'shuffle', 'game_action'];
export class ZKPokerProver {
    paths;
    constructor(paths) {
        this.paths = paths;
    }
    circuitPath(name, ext) {
        return `${this.paths.targetDir}/circuit_${name}.${ext}`;
    }
    // Run sunspot command
    async runSunspot(args) {
        return new Promise((resolve, reject) => {
            const proc = spawn(this.paths.sunspotBin, args);
            let stdout = '';
            let stderr = '';
            proc.stdout.on('data', (data) => { stdout += data.toString(); });
            proc.stderr.on('data', (data) => { stderr += data.toString(); });
            proc.on('close', (code) => {
                if (code === 0)
                    resolve(stdout);
                else
                    reject(new Error(`sunspot failed: ${stderr || stdout}`));
            });
        });
    }
    // Compile circuit (nargo + sunspot compile)
    async compile(name) {
        await this.runSunspot(['compile', this.circuitPath(name, 'json')]);
    }
    // Setup proving/verifying keys
    async setup(name) {
        await this.runSunspot(['setup', this.circuitPath(name, 'ccs')]);
    }
    // Generate proof
    async prove(name) {
        await this.runSunspot([
            'prove',
            this.circuitPath(name, 'json'),
            this.circuitPath(name, 'gz'),
            this.circuitPath(name, 'ccs'),
            this.circuitPath(name, 'pk'),
        ]);
    }
    // Verify proof
    async verify(name) {
        try {
            await this.runSunspot([
                'verify',
                this.circuitPath(name, 'vk'),
                this.circuitPath(name, 'proof'),
                this.circuitPath(name, 'pw'),
            ]);
            return true;
        }
        catch {
            return false;
        }
    }
    // Full prove workflow: compile -> setup -> prove -> verify
    async proveAndVerify(name) {
        await this.compile(name);
        await this.setup(name);
        await this.prove(name);
        return this.verify(name);
    }
}
// Helper: Convert bigint to Field string (hex)
export function toField(value) {
    return '0x' + value.toString(16).padStart(64, '0');
}
// Helper: Split a bigint into lo and hi limbs (128 bits each)
export function splitScalar(scalar) {
    const mask = (1n << 128n) - 1n;
    return {
        lo: toField(scalar & mask),
        hi: toField(scalar >> 128n),
    };
}
// Helper: Generate a random scalar
export function randomScalar() {
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
//# sourceMappingURL=prover.js.map