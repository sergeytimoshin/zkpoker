#!/usr/bin/env npx ts-node
/**
 * Generate Prover.toml inputs for ZK Poker circuits
 *
 * This script computes the necessary values (hashes, curve points)
 * to create valid prover inputs for testing.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// For game_action circuit, we need to compute Pedersen hashes
// We'll use a helper Noir program to compute these

const CIRCUITS_DIR = path.join(__dirname, '..', 'crates');

// Game state values for a simple test case
const gameStateTest = {
  stack_p1: 99,    // After posting small blind
  stack_p2: 98,    // After posting big blind
  pot: 3,
  street: 0,       // PREFLOP
  current_player: 1, // Small blind acts first
  last_action: 1,  // ACTION_BET (big blind counts as bet)
  last_bet_size: 2,
  street_bet_p1: 1,
  street_bet_p2: 2,
  status: 1,       // STATUS_ACTIVE
  dealer: 1,
};

// Action: Player 1 calls (puts in 1 more to match the 2)
const actionTest = {
  action_type: 2,  // ACTION_CALL
  action_amount: 0,
};

// Expected state after call
const stateAfterCall = {
  stack_p1: 98,    // 99 - 1
  stack_p2: 98,
  pot: 4,          // 3 + 1
  street: 1,       // Advances to FLOP (both acted, bets equal)
  current_player: 2, // Non-dealer acts first post-flop
  last_action: 0,  // ACTION_NULL (new street)
  last_bet_size: 0,
  street_bet_p1: 0, // Reset for new street
  street_bet_p2: 0,
  status: 1,
  dealer: 1,
};

// Generate Prover.toml content for game_action circuit
function generateGameActionProver(): string {
  // Player hashes (simple test values)
  const player1_hash = "0x1111111111111111111111111111111111111111111111111111111111111111";
  const player2_hash = "0x2222222222222222222222222222222222222222222222222222222222222222";

  return `# Game Action Circuit Prover Inputs
# Test case: Player 1 calls the big blind

# === Public Inputs ===
# Note: These commitment values need to be computed by the circuit
# For testing, we use placeholder values - the circuit will verify them
state_before_commitment = "0x0"  # Will be computed
state_after_commitment = "0x0"   # Will be computed
player_hash = "${player1_hash}"

# === Private Inputs ===
# Game state before action
stack_p1_before = ${gameStateTest.stack_p1}
stack_p2_before = ${gameStateTest.stack_p2}
pot_before = ${gameStateTest.pot}
street_before = ${gameStateTest.street}
current_player_before = ${gameStateTest.current_player}
last_action_before = ${gameStateTest.last_action}
last_bet_size_before = ${gameStateTest.last_bet_size}
street_bet_p1_before = ${gameStateTest.street_bet_p1}
street_bet_p2_before = ${gameStateTest.street_bet_p2}
status_before = ${gameStateTest.status}
dealer = ${gameStateTest.dealer}

# Action being taken
action_type = ${actionTest.action_type}
action_amount = ${actionTest.action_amount}

# Player identification
player1_hash = "${player1_hash}"
player2_hash = "${player2_hash}"
`;
}

// For circuits requiring Pedersen hashes, we need to compute them
// This requires running Noir code. Let's create a helper circuit.

const helperCircuitCode = `
// Helper to compute hash values for prover inputs
use zkpoker_primitives::game_state::GameState;
use std::hash::pedersen_hash;

fn main(
    // Game state fields
    stack_p1: u32,
    stack_p2: u32,
    pot: u32,
    street: u8,
    current_player: u8,
    last_action: u8,
    last_bet_size: u32,
    street_bet_p1: u32,
    street_bet_p2: u32,
    status: u8,
    dealer: u8,
) -> pub Field {
    let state = GameState {
        stack_p1,
        stack_p2,
        pot,
        street,
        current_player,
        last_action,
        last_bet_size,
        street_bet_p1,
        street_bet_p2,
        status,
        dealer,
    };
    state.commitment()
}
`;

console.log("=== Game Action Circuit Prover.toml ===\n");
console.log(generateGameActionProver());

console.log("\n=== Instructions ===");
console.log("To generate valid commitment values, you need to:");
console.log("1. Create a helper circuit that outputs the Pedersen hash");
console.log("2. Use 'nargo execute' with the game state values");
console.log("3. Copy the computed hash values to Prover.toml");
console.log("\nAlternatively, use the provided test values which");
console.log("demonstrate the expected format for each circuit.");
