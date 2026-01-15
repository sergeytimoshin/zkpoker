import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface ServerConfig {
  port: number;
  host: string;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  maxRooms: number;
  circuitsPath: string;
  // Hand evaluation Merkle roots (from hand rankings lookup tables)
  merkleRootBasic: string;  // For non-flush hands
  merkleRootFlush: string;  // For flush hands
}

export const config: ServerConfig = {
  port: parseInt(process.env.PORT || '8080', 10),
  host: process.env.HOST || '0.0.0.0',
  heartbeatIntervalMs: 120000, // Increased: proof generation blocks main thread for ~30-60s
  heartbeatTimeoutMs: 300000,  // 5 minutes to allow multiple proof generations
  maxRooms: 100,
  // Path to circom build directory containing compiled circuits
  circuitsPath: process.env.CIRCUITS_PATH || resolve(__dirname, '../../../circom/build'),
  merkleRootBasic: '0x1fc95394071771508f5282dab1229ebb2d427cbdf8602dcc502fa40dde0e0a29',
  merkleRootFlush: '0x07388bf18f3561827776f2f1586c66e55e1a9deee8302b150266c5d76bdebc0e',
};
