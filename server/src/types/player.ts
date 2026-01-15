export interface Point {
  x: bigint;
  y: bigint;
  isInfinity: boolean;
}

export interface PlayerState {
  id: string;
  seatIndex: number; // 0-9
  stack: number;
  streetBet: number;
  totalBet: number; // Total contribution to pot across all streets (for side pot calculation)
  folded: boolean;
  allIn: boolean;
  isConnected: boolean;
  publicKey: Point | null;
}

export interface ConnectedPlayer {
  id: string;
  roomId: string | null;
  isReady: boolean;
}

export function createPlayerState(
  id: string,
  seatIndex: number,
  stack: number,
  publicKey: Point | null = null
): PlayerState {
  return {
    id,
    seatIndex,
    stack,
    streetBet: 0,
    totalBet: 0,
    folded: false,
    allIn: false,
    isConnected: true,
    publicKey,
  };
}
