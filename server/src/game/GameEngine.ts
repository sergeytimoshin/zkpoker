import {
  type GameStateN,
  type PlayerState,
  type GameAction,
  type GameConfig,
  type SidePot,
  Street,
  ActionType,
  GameStatus,
  DEFAULT_GAME_CONFIG,
  createInitialGameState,
} from '../types/index.js';

export class GameEngine {
  private state: GameStateN;
  private config: GameConfig;
  private playerNames: Map<string, string> = new Map();

  constructor(players: PlayerState[], config: GameConfig = DEFAULT_GAME_CONFIG) {
    this.config = config;
    this.state = createInitialGameState(players, config);
  }

  getState(): GameStateN {
    return this.state;
  }

  getConfig(): GameConfig {
    return this.config;
  }

  getActivePlayers(): PlayerState[] {
    return this.state.players.filter(p => !p.folded && p.stack > 0);
  }

  getActivePlayerCount(): number {
    return this.getActivePlayers().length;
  }

  getPlayerByIndex(seatIndex: number): PlayerState | undefined {
    return this.state.players.find(p => p.seatIndex === seatIndex);
  }

  getPlayerById(playerId: string): PlayerState | undefined {
    return this.state.players.find(p => p.id === playerId);
  }

  // Get next active player seat index after given position
  private getNextActivePlayer(fromSeat: number): number {
    const numPlayers = this.state.players.length;
    let seat = (fromSeat + 1) % numPlayers;
    let iterations = 0;

    while (iterations < numPlayers) {
      const player = this.getPlayerByIndex(seat);
      if (player && !player.folded && !player.allIn) {
        return seat;
      }
      seat = (seat + 1) % numPlayers;
      iterations++;
    }

    return -1; // No active players found
  }

  // Get small blind position
  getSmallBlindPosition(): number {
    if (this.state.players.length === 2) {
      // Heads up: dealer is small blind
      return this.state.buttonPos;
    }
    return this.getNextActivePlayer(this.state.buttonPos);
  }

  // Get big blind position
  getBigBlindPosition(): number {
    return this.getNextActivePlayer(this.getSmallBlindPosition());
  }

  // Get UTG (under the gun) position - first to act preflop
  getUTGPosition(): number {
    return this.getNextActivePlayer(this.getBigBlindPosition());
  }

  // Post blinds and set initial action position
  postBlinds(): void {
    const sbPos = this.getSmallBlindPosition();
    const bbPos = this.getBigBlindPosition();

    const sbPlayer = this.getPlayerByIndex(sbPos);
    const bbPlayer = this.getPlayerByIndex(bbPos);

    if (sbPlayer) {
      const sbAmount = Math.min(this.config.smallBlind, sbPlayer.stack);
      sbPlayer.stack -= sbAmount;
      sbPlayer.streetBet = sbAmount;
      sbPlayer.totalBet += sbAmount;
      this.state.pot += sbAmount;
      if (sbPlayer.stack === 0) sbPlayer.allIn = true;
    }

    if (bbPlayer) {
      const bbAmount = Math.min(this.config.bigBlind, bbPlayer.stack);
      bbPlayer.stack -= bbAmount;
      bbPlayer.streetBet = bbAmount;
      bbPlayer.totalBet += bbAmount;
      this.state.pot += bbAmount;
      if (bbPlayer.stack === 0) bbPlayer.allIn = true;
    }

    this.state.lastRaiseAmount = this.config.bigBlind;
    this.state.minRaise = this.config.bigBlind;
    this.state.actionPos = this.getUTGPosition();
    this.state.status = GameStatus.BETTING;
  }

  // Get valid actions for current player
  getValidActions(): ActionType[] {
    const player = this.getPlayerByIndex(this.state.actionPos);
    if (!player || player.folded || player.allIn) return [];

    const actions: ActionType[] = [ActionType.FOLD];
    const amountToCall = this.getAmountToCall(player);

    if (amountToCall === 0) {
      actions.push(ActionType.CHECK);
    } else {
      actions.push(ActionType.CALL);
    }

    // Can only bet if no one has bet this street
    const maxStreetBet = Math.max(...this.state.players.map(p => p.streetBet));
    if (maxStreetBet === 0 || (this.state.street === Street.PREFLOP && maxStreetBet === this.config.bigBlind)) {
      if (player.stack > amountToCall) {
        actions.push(ActionType.BET);
      }
    }

    // Can raise if someone has bet
    if (maxStreetBet > 0 && player.stack > amountToCall) {
      actions.push(ActionType.RAISE);
    }

    // Can always go all-in if has chips
    if (player.stack > 0) {
      actions.push(ActionType.ALL_IN);
    }

    return actions;
  }

  getAmountToCall(player: PlayerState): number {
    const maxBet = Math.max(...this.state.players.map(p => p.streetBet));
    return Math.min(maxBet - player.streetBet, player.stack);
  }

  getMinRaise(): number {
    return this.state.minRaise;
  }

  getMinBet(): number {
    return this.config.bigBlind;
  }

  // Apply an action and return success
  applyAction(action: GameAction): { success: boolean; error?: string } {
    const player = this.getPlayerById(action.playerId);
    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    if (player.seatIndex !== this.state.actionPos) {
      return { success: false, error: 'Not your turn' };
    }

    const validActions = this.getValidActions();
    if (!validActions.includes(action.type)) {
      return { success: false, error: 'Invalid action' };
    }

    switch (action.type) {
      case ActionType.FOLD:
        return this.handleFold(player);
      case ActionType.CHECK:
        return this.handleCheck(player);
      case ActionType.CALL:
        return this.handleCall(player);
      case ActionType.BET:
        return this.handleBet(player, action.amount);
      case ActionType.RAISE:
        return this.handleRaise(player, action.amount);
      case ActionType.ALL_IN:
        return this.handleAllIn(player);
    }
  }

  private handleFold(player: PlayerState): { success: boolean } {
    player.folded = true;
    this.advanceAction();
    return { success: true };
  }

  private handleCheck(player: PlayerState): { success: boolean; error?: string } {
    if (this.getAmountToCall(player) > 0) {
      return { success: false, error: 'Cannot check - must call or fold' };
    }
    this.advanceAction();
    return { success: true };
  }

  private handleCall(player: PlayerState): { success: boolean } {
    const amount = this.getAmountToCall(player);
    player.stack -= amount;
    player.streetBet += amount;
    player.totalBet += amount;
    this.state.pot += amount;
    if (player.stack === 0) player.allIn = true;
    this.advanceAction();
    return { success: true };
  }

  private handleBet(player: PlayerState, amount: number): { success: boolean; error?: string } {
    if (amount < this.config.bigBlind) {
      return { success: false, error: `Minimum bet is ${this.config.bigBlind}` };
    }
    if (amount > player.stack) {
      return { success: false, error: 'Insufficient chips' };
    }

    player.stack -= amount;
    player.streetBet += amount;
    player.totalBet += amount;
    this.state.pot += amount;
    this.state.lastAggressor = player.seatIndex;
    this.state.lastRaiseAmount = amount;
    this.state.minRaise = amount;
    if (player.stack === 0) player.allIn = true;
    this.advanceAction();
    return { success: true };
  }

  private handleRaise(player: PlayerState, totalAmount: number): { success: boolean; error?: string } {
    // totalAmount is the total bet the player wants to have (e.g., "raise to 6")
    const currentMaxBet = Math.max(...this.state.players.map(p => p.streetBet));
    const raiseAmount = totalAmount - currentMaxBet;
    const additionalBet = totalAmount - player.streetBet;

    if (raiseAmount < this.state.minRaise && additionalBet < player.stack) {
      return { success: false, error: `Minimum raise is ${this.state.minRaise}` };
    }
    if (additionalBet > player.stack) {
      return { success: false, error: 'Insufficient chips' };
    }

    player.stack -= additionalBet;
    player.streetBet = totalAmount;
    player.totalBet += additionalBet;
    this.state.pot += additionalBet;
    this.state.lastAggressor = player.seatIndex;
    this.state.lastRaiseAmount = raiseAmount;
    this.state.minRaise = raiseAmount;
    if (player.stack === 0) player.allIn = true;
    this.advanceAction();
    return { success: true };
  }

  private handleAllIn(player: PlayerState): { success: boolean } {
    const amount = player.stack;
    const currentMaxBet = Math.max(...this.state.players.map(p => p.streetBet));
    const newBet = player.streetBet + amount;

    if (newBet > currentMaxBet) {
      const raiseAmount = newBet - currentMaxBet;
      if (raiseAmount >= this.state.minRaise) {
        this.state.lastAggressor = player.seatIndex;
        this.state.lastRaiseAmount = raiseAmount;
        this.state.minRaise = raiseAmount;
      }
    }

    player.streetBet += amount;
    player.totalBet += amount;
    this.state.pot += amount;
    player.stack = 0;
    player.allIn = true;
    this.advanceAction();
    return { success: true };
  }

  private advanceAction(): void {
    // Check if only one player left
    const activePlayers = this.state.players.filter(p => !p.folded);
    if (activePlayers.length === 1) {
      this.state.status = GameStatus.FINISHED;
      return;
    }

    // Check if only players remaining are all-in
    const playersWhoCanAct = this.state.players.filter(p => !p.folded && !p.allIn);
    if (playersWhoCanAct.length <= 1) {
      const allBetsEqual = this.areAllBetsEqual();
      if (allBetsEqual || playersWhoCanAct.length === 0) {
        this.advanceStreet();
        return;
      }
    }

    // Find next player to act
    const nextSeat = this.getNextActivePlayer(this.state.actionPos);

    if (nextSeat === -1) {
      // No active players who can act
      this.advanceStreet();
      return;
    }

    // Check if back to aggressor (betting round complete)
    if (this.state.lastAggressor !== null && nextSeat === this.state.lastAggressor) {
      if (this.areAllBetsEqual()) {
        this.advanceStreet();
        return;
      }
    }

    // Check if betting round complete with no aggressor
    if (this.state.lastAggressor === null && this.areAllBetsEqual()) {
      if (this.state.street === Street.PREFLOP) {
        // Preflop: UTG acts first, BB acts last with option
        // Round ends when coming back to UTG (first actor)
        const utg = this.getUTGPosition();
        if (nextSeat === utg) {
          this.advanceStreet();
          return;
        }
      } else {
        // Post-flop: first after button acts first, round ends when back to them
        const firstToAct = this.getNextActivePlayer(this.state.buttonPos);
        if (nextSeat === firstToAct) {
          this.advanceStreet();
          return;
        }
      }
    }

    this.state.actionPos = nextSeat;
  }

  private areAllBetsEqual(): boolean {
    const activePlayers = this.state.players.filter(p => !p.folded);
    const bets = activePlayers.map(p => p.streetBet);
    const maxBet = Math.max(...bets);
    return activePlayers.every(p => p.streetBet === maxBet || p.allIn);
  }

  private hasEveryoneActed(): boolean {
    // If there's an aggressor, everyone after them has acted when we're back to them
    if (this.state.lastAggressor !== null) {
      return this.state.actionPos === this.state.lastAggressor;
    }
    // Preflop: BB is last to act, everyone has acted when we're back to BB
    if (this.state.street === Street.PREFLOP) {
      return this.state.actionPos === this.getBigBlindPosition();
    }
    // Post-flop with no aggressor (all checks): action completes when back to first position
    // First position post-flop is first active after button
    const firstToAct = this.getNextActivePlayer(this.state.buttonPos);
    return this.state.actionPos === firstToAct;
  }

  advanceStreet(): void {
    if (this.state.street === Street.RIVER) {
      this.state.street = Street.SHOWDOWN;
      this.state.status = GameStatus.SHOWDOWN;
      return;
    }

    // Reset for new street
    for (const player of this.state.players) {
      player.streetBet = 0;
    }
    this.state.lastAggressor = null;
    this.state.minRaise = this.config.bigBlind;
    this.state.lastRaiseAmount = 0;

    // Advance street
    this.state.street++;

    // First to act is first active player after button
    this.state.actionPos = this.getNextActivePlayer(this.state.buttonPos);

    // If only one player can act, advance again
    const playersWhoCanAct = this.state.players.filter(p => !p.folded && !p.allIn);
    if (playersWhoCanAct.length <= 1) {
      this.advanceStreet();
    }
  }

  // Calculate side pots for showdown based on total contributions
  calculateSidePots(): SidePot[] {
    const sidePots: SidePot[] = [];

    // Get all players who contributed (including folded - they contributed but can't win)
    const allContributors = this.state.players
      .filter(p => p.totalBet > 0)
      .sort((a, b) => a.totalBet - b.totalBet);

    // Active players who can win (not folded)
    const activePlayers = this.state.players.filter(p => !p.folded);

    let previousBet = 0;

    for (let i = 0; i < allContributors.length; i++) {
      const player = allContributors[i];
      const contributionLevel = player.totalBet;
      const sliceAmount = contributionLevel - previousBet;

      if (sliceAmount > 0) {
        // Count how many players contributed at least this much
        const contributorsAtThisLevel = allContributors.filter(
          p => p.totalBet >= contributionLevel
        ).length + i; // Players from i onwards plus those before who contributed more

        // Actually, simpler: all players from index i onwards contributed at least this slice
        const numContributors = allContributors.length - i;
        const potAmount = sliceAmount * numContributors;

        // Eligible winners are active (not folded) players who contributed at least this amount
        const eligiblePlayers = activePlayers
          .filter(p => p.totalBet >= contributionLevel)
          .map(p => p.id);

        // Only create pot if there are eligible winners
        if (eligiblePlayers.length > 0 && potAmount > 0) {
          sidePots.push({
            amount: potAmount,
            eligiblePlayers,
          });
        }
      }

      previousBet = contributionLevel;
    }

    return sidePots;
  }

  // Set status
  setStatus(status: GameStatus): void {
    this.state.status = status;
  }

  // Start new hand with rotated button
  resetForNewHand(): void {
    const numPlayers = this.state.players.length;
    this.state.buttonPos = (this.state.buttonPos + 1) % numPlayers;
    this.state.pot = 0;
    this.state.sidePots = [];
    this.state.street = Street.PREFLOP;
    this.state.lastAggressor = null;
    this.state.lastRaiseAmount = 0;
    this.state.minRaise = this.config.bigBlind;
    this.state.status = GameStatus.SHUFFLE;
    this.state.communityCards = [];
    this.state.deck = [];
    this.state.currentShuffler = 0;

    for (const player of this.state.players) {
      player.streetBet = 0;
      player.totalBet = 0;
      player.folded = false;
      player.allIn = false;
    }
  }
}
