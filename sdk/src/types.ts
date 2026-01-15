// Type definitions for ZK Poker SDK

// Represents an unmasked card as a curve point
export interface Card {
  index: number;  // 0-51
  x: bigint;      // Curve point x coordinate
  y: bigint;      // Curve point y coordinate
}

// Represents a masked card (ElGamal encrypted)
export interface MaskedCard {
  epk: { x: bigint; y: bigint; isInfinite: boolean };
  msg: { x: bigint; y: bigint };
  pk: { x: bigint; y: bigint; isInfinite: boolean };
}

// Player keys for masking/unmasking
export interface PlayerKeys {
  secret: bigint;      // Private scalar
  publicKey: { x: bigint; y: bigint };
}

// Proof data returned from proof generation
export interface ProofData {
  proof: Uint8Array;
  publicInputs: string[];
}

// Inputs for the mask circuit
export interface MaskCircuitInputs {
  input_card_commitment: string;
  output_card_commitment: string;
  player_pub_x: string;
  player_pub_y: string;
  input_epk_x: string;
  input_epk_y: string;
  input_epk_is_inf: boolean;
  input_msg_x: string;
  input_msg_y: string;
  input_pk_x: string;
  input_pk_y: string;
  input_pk_is_inf: boolean;
  player_secret_lo: string;
  player_secret_hi: string;
  nonce_lo: string;
  nonce_hi: string;
}

// Inputs for the unmask circuit
export interface UnmaskCircuitInputs {
  input_card_commitment: string;
  output_card_commitment: string;
  player_pub_x: string;
  player_pub_y: string;
  input_epk_x: string;
  input_epk_y: string;
  input_msg_x: string;
  input_msg_y: string;
  input_pk_x: string;
  input_pk_y: string;
  player_secret_lo: string;
  player_secret_hi: string;
}

// Game state for poker
export interface GameState {
  stackP1: number;
  stackP2: number;
  pot: number;
  street: number;
  currentPlayer: number;
  lastAction: number;
  lastBetSize: number;
  streetBetP1: number;
  streetBetP2: number;
  status: number;
  dealer: number;
}

// Action for game state transitions
export interface Action {
  actionType: number;
  amount: number;
}

// Scalar represented as two 128-bit limbs
export interface Scalar {
  lo: bigint;
  hi: bigint;
}

// Action types
export const ACTION_NULL = 0;
export const ACTION_BET = 1;
export const ACTION_CALL = 2;
export const ACTION_FOLD = 3;
export const ACTION_RAISE = 4;
export const ACTION_CHECK = 5;
export const ACTION_ALL_IN = 6;

// Street constants
export const STREET_PREFLOP = 0;
export const STREET_FLOP = 1;
export const STREET_TURN = 2;
export const STREET_RIVER = 3;
export const STREET_SHOWDOWN = 4;

// Game status
export const STATUS_WAITING = 0;
export const STATUS_ACTIVE = 1;
export const STATUS_FINISHED = 2;
