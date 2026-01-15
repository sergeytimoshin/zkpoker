// Game State Management

const ActionType = {
  FOLD: 0,
  CHECK: 1,
  CALL: 2,
  BET: 3,
  RAISE: 4,
  ALL_IN: 5
};

const ActionNames = {
  0: 'Fold',
  1: 'Check',
  2: 'Call',
  3: 'Bet',
  4: 'Raise',
  5: 'All In'
};

const Street = {
  PREFLOP: 0,
  FLOP: 1,
  TURN: 2,
  RIVER: 3,
  SHOWDOWN: 4
};

const StreetNames = {
  0: 'Preflop',
  1: 'Flop',
  2: 'Turn',
  3: 'River',
  4: 'Showdown'
};

const GameStatus = {
  WAITING: 'waiting',
  SHUFFLE: 'shuffle',
  DEALING: 'dealing',
  BETTING: 'betting',
  SHOWDOWN: 'showdown',
  FINISHED: 'finished'
};

class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    // Connection
    this.connected = false;
    this.playerId = null;
    this.playerName = '';
    this.ws = null;

    // Room
    this.roomId = null;
    this.config = null;

    // Players
    this.players = [];
    this.mySeatIndex = -1;

    // Game state
    this.status = GameStatus.WAITING;
    this.street = Street.PREFLOP;
    this.pot = 0;
    this.buttonPos = 0;
    this.actionPos = -1;
    this.communityCards = [];

    // My cards
    this.myCardIndices = [];
    this.myCards = []; // Decrypted card indices

    // Turn info
    this.validActions = [];
    this.minBet = 0;
    this.minRaise = 0;
    this.amountToCall = 0;
    this.isMyTurn = false;
    this.turnTimeoutMs = 60000;
    this.turnStartTime = null;

    // Ready state
    this.isReady = false;
  }

  getPlayer(playerId) {
    return this.players.find(p => p.id === playerId);
  }

  getPlayerBySeat(seatIndex) {
    return this.players.find(p => p.seatIndex === seatIndex);
  }

  getMe() {
    return this.players.find(p => p.id === this.playerId);
  }

  isGameInProgress() {
    return this.status !== GameStatus.WAITING && this.status !== GameStatus.FINISHED;
  }

  isBettingPhase() {
    return this.status === GameStatus.BETTING;
  }

  updateFromGameState(gameState) {
    if (gameState.players) {
      // Merge player data
      for (const player of gameState.players) {
        const existing = this.getPlayer(player.id);
        if (existing) {
          Object.assign(existing, player);
        }
      }
    }

    if (gameState.pot !== undefined) this.pot = gameState.pot;
    if (gameState.street !== undefined) this.street = gameState.street;
    if (gameState.buttonPos !== undefined) this.buttonPos = gameState.buttonPos;
    if (gameState.actionPos !== undefined) this.actionPos = gameState.actionPos;
    if (gameState.status !== undefined) this.status = gameState.status;
  }

  calculateAmountToCall() {
    const me = this.getMe();
    if (!me) return 0;

    const maxBet = Math.max(...this.players.map(p => p.streetBet || 0));
    return Math.min(maxBet - (me.streetBet || 0), me.stack || 0);
  }
}

// Global game state
const gameState = new GameState();
