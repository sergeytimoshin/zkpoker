# ZKPoker

A zero-knowledge proof-based poker implementation using Circom circuits for cryptographic proofs and TypeScript for the game server and client.

> **⚠️ Disclaimer**: This is an experimental project for educational and research purposes only. The code has **not been audited** and should **not be used in production** or with real funds. Use at your own risk.

## Overview

ZKPoker implements a complete mental poker protocol where players can prove the correctness of their actions (shuffling, masking, unmasking cards) without revealing private information. The system uses:

- **ElGamal encryption** on the BabyJubJub curve for card masking
- **Poseidon hashing** for commitments
- **Groth16** proofs via snarkjs for verification

## Project Structure

```
zkpoker/
├── circom/                     # Circom circuits (production)
│   ├── circuits/               # Circuit source files
│   ├── build/                  # Compiled circuits (generated)
│   └── sdk/                    # JavaScript SDK for circom
├── server/                     # WebSocket game server (TypeScript)
├── client/                     # Browser game client (JavaScript)
├── sdk/                        # TypeScript SDK for off-chain computation
├── crates/                     # Noir circuits (experimental port)
│   ├── zkpoker_primitives/     # Core crypto library
│   └── circuit_*/              # Circuit implementations
├── data/                       # Hand evaluation lookup tables
└── scripts/                    # Build utilities
```

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Circom](https://docs.circom.io/getting-started/installation/) (for circuit compilation)
- [snarkjs](https://github.com/iden3/snarkjs) (included as dependency)

Optional (for Noir development):
- [Noir](https://noir-lang.org/docs/getting_started/installation) >= 0.36.0

## Quick Start

### 1. Build Circom Circuits

```bash
cd circom
npm install
npm run compile
```

This generates proving keys, verification keys, and WASM files in `circom/build/`.

### 2. Start the Server

```bash
cd server
npm install
npm run build
npm start
```

### 3. Run the Client

```bash
cd client
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## Components

### Circom Circuits (`circom/`)

The production circuits used by the client and server:

| Circuit | Purpose |
|---------|---------|
| `shuffle` | Proves correct deck shuffling and masking |
| `reshuffle` | Shuffle for players 2+ (already-masked deck) |
| `mask` | Proves single card masking with player's key |
| `unmask` | Proves correct partial card decryption |
| `add_keys` | Add player's key to deck without shuffling |
| `hand_eval` | Proves poker hand rank via Merkle proof |
| `game_action` | Validates betting actions (fold, check, call, bet, raise) |
| `showdown` | Proves winner determination and pot distribution |

```bash
cd circom
npm run compile           # Compile all circuits
npm run compile:shuffle   # Compile shuffle circuit only
npm run compile:reshuffle # Compile reshuffle circuit only
npm test                  # Run tests
npm run clean             # Remove build artifacts
```

### Server (`server/`)

WebSocket-based game server handling:
- Room management and matchmaking
- Game state synchronization
- Proof verification via snarkjs
- Heartbeat/disconnect detection

```bash
cd server
npm run dev      # Development with hot reload
npm run build    # Compile TypeScript
npm start        # Production server
npm test         # Run tests
```

### Client (`client/`)

Browser-based poker client with:
- Real-time WebSocket communication
- In-browser proof generation via snarkjs
- Single-player and multiplayer modes

```bash
cd client
npm run dev      # Vite dev server
npm run build    # Production build
npm run preview  # Preview build
```

### SDK (`sdk/`)

TypeScript library for off-chain computation:
- Elliptic curve operations (BabyJubJub)
- Card encoding utilities
- Pedersen hashing
- ElGamal encryption
- Game state management

```bash
cd sdk
npm run build    # Compile TypeScript
npm test         # Run tests
```

### Noir Circuits (`crates/`) - Experimental

An experimental port of the circuits to Noir language. Not used by the production client/server.

```bash
nargo compile    # Compile Noir circuits
nargo test       # Run Noir tests
```

## Circuit Details

### Card Representation

Cards are encoded using prime numbers for efficient hand evaluation:
- Each card has a unique prime based on rank
- 52-card deck with 4 suits × 13 ranks

### ElGamal Encryption

Cards are encrypted using lifted ElGamal on BabyJubJub:
- `epk` (ephemeral public key): `r * G`
- `msg` (encrypted message): `M + r * pk_combined`
- `pk` (combined public key): sum of all players' public keys

### Mental Poker Protocol

1. **Setup**: Each player generates a secret key and shares their public key
2. **Shuffle**: Each player shuffles the deck and masks all cards with their key
3. **Deal**: Cards are dealt as encrypted values
4. **Unmask**: Players collaboratively unmask cards as needed
5. **Showdown**: Players prove their hand rankings without revealing cards to server

## Data Files

Hand evaluation uses precomputed lookup tables in `data/`:
- `lookup_table_basic.json` - Non-flush hand rankings
- `lookup_table_flush.json` - Flush hand rankings
- Merkle tree proofs verify hand ranks in-circuit

## Development

### Running Tests

```bash
# Circom tests
cd circom && npm test

# Server tests
cd server && npm test

# SDK tests
cd sdk && npm test

# Noir tests (experimental)
nargo test
```

### Powers of Tau

The circuits require Powers of Tau ceremony files. Download them to `circom/build/`:
- `pot20_final.ptau` - For smaller circuits
- `pot22_final.ptau` - For shuffle circuits

## Security

This project is experimental and has **not undergone a security audit**. Known considerations:

- Cryptographic implementations may contain vulnerabilities
- The mental poker protocol has not been formally verified
- Random number generation may not be cryptographically secure in all contexts
- Side-channel attacks have not been analyzed

**Do not use this software for real money or in any security-critical application.**

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
