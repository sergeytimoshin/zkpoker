export interface Card {
    index: number;
    x: bigint;
    y: bigint;
}
export interface MaskedCard {
    epk: {
        x: bigint;
        y: bigint;
        isInfinite: boolean;
    };
    msg: {
        x: bigint;
        y: bigint;
    };
    pk: {
        x: bigint;
        y: bigint;
        isInfinite: boolean;
    };
}
export interface PlayerKeys {
    secret: bigint;
    publicKey: {
        x: bigint;
        y: bigint;
    };
}
export interface ProofData {
    proof: Uint8Array;
    publicInputs: string[];
}
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
export interface Action {
    actionType: number;
    amount: number;
}
export interface Scalar {
    lo: bigint;
    hi: bigint;
}
export declare const ACTION_NULL = 0;
export declare const ACTION_BET = 1;
export declare const ACTION_CALL = 2;
export declare const ACTION_FOLD = 3;
export declare const ACTION_RAISE = 4;
export declare const ACTION_CHECK = 5;
export declare const ACTION_ALL_IN = 6;
export declare const STREET_PREFLOP = 0;
export declare const STREET_FLOP = 1;
export declare const STREET_TURN = 2;
export declare const STREET_RIVER = 3;
export declare const STREET_SHOWDOWN = 4;
export declare const STATUS_WAITING = 0;
export declare const STATUS_ACTIVE = 1;
export declare const STATUS_FINISHED = 2;
//# sourceMappingURL=types.d.ts.map