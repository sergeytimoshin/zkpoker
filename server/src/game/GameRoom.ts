import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import { connectionManager } from '../network/ConnectionManager.js';
import { GameEngine } from './GameEngine.js';
import { proofVerifier } from '../proof/ProofVerifier.js';
import { config } from '../utils/config.js';
import {
  pedersenHash,
  cardCommitment as computeCardCommitment,
  type Card as SDKCard,
  type Point as SDKPoint,
} from '@zkpoker/sdk';
import {
  type GameConfig,
  type GameAction,
  type PlayerState,
  type Point,
  type Card,
  type SerializedGameState,
  type SerializedCard,
  RoomStatus,
  GameStatus,
  Street,
  DEFAULT_GAME_CONFIG,
  createPlayerState,
} from '../types/index.js';

interface RoomPlayer {
  id: string;
  name: string;
  seatIndex: number;
  isReady: boolean;
  publicKey: Point;
}

interface UnmaskTracker {
  cardIndex: number;
  forPlayerId: string;
  unmaskedBy: Set<string>; // Player IDs who have submitted unmask
  currentCard: Card | null;
  pendingPlayers: string[]; // Players who still need to unmask (for sequential processing)
}

interface HandReveal {
  playerId: string;
  handRank: number;
  handDescription: string;
  cardIndices: number[];
  verified: boolean;
}

export class GameRoom {
  readonly id: string;
  private status: RoomStatus = RoomStatus.WAITING;
  private players: Map<string, RoomPlayer> = new Map();
  private config: GameConfig;
  private engine: GameEngine | null = null;
  private turnTimeoutHandle: NodeJS.Timeout | null = null;

  // Deck and commitment tracking
  private deckCommitment: string = '0x0'; // Current deck commitment hash
  private cardCommitments: Map<number, string> = new Map(); // cardIndex -> commitment
  private stateCommitment: string = '0x0'; // Current game state commitment

  // Unmask tracking
  private unmaskTrackers: Map<string, UnmaskTracker> = new Map(); // key: `${cardIndex}`
  private holeCardIndices: Map<string, number[]> = new Map(); // playerId -> card indices

  // Showdown tracking
  private handReveals: Map<string, HandReveal> = new Map();
  private showdownTimeoutHandle: NodeJS.Timeout | null = null;

  // Street tracking for community card dealing
  private previousStreet: Street = Street.PREFLOP;
  private communityCardIndices: number[] = []; // Indices of revealed community cards

  // Pending proofs for async verification
  private pendingProofs: Map<string, { resolve: (valid: boolean) => void }> = new Map();

  constructor(config: GameConfig = DEFAULT_GAME_CONFIG) {
    this.id = uuidv4();
    this.config = config;
  }

  // ========== COMMITMENT HELPERS ==========

  /**
   * Compute deck commitment from array of cards
   * Deck commitment = product of card commitments (as per circuit_shuffle)
   */
  private computeDeckCommitment(deck: Card[]): string {
    if (deck.length === 0) {
      return '0x1'; // Empty deck commitment
    }

    // Convert server Card to SDK format for commitment computation
    let commitment = 1n;
    for (const card of deck) {
      const cardHash = this.computeCardCommitment(card);
      commitment = (commitment * cardHash) % BigInt('0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001');
    }
    return '0x' + commitment.toString(16).padStart(64, '0');
  }

  /**
   * Compute commitment for a single card
   */
  private computeCardCommitment(card: Card): bigint {
    const sdkCard: SDKCard = {
      epk: this.pointToSDKPoint(card.epk),
      msg: this.pointToSDKPoint(card.msg),
      pk: this.pointToSDKPoint(card.pk),
    };
    return computeCardCommitment(sdkCard);
  }

  /**
   * Convert server Point to SDK Point format
   */
  private pointToSDKPoint(point: Point): SDKPoint {
    return {
      x: point.x,
      y: point.y,
      isInfinity: point.isInfinity ?? false,
    };
  }

  /**
   * Compute game state commitment (for game_action verification)
   */
  private computeStateCommitment(): string {
    if (!this.engine) return '0x0';

    const state = this.engine.getState();
    const players = state.players.sort((a, b) => a.seatIndex - b.seatIndex);

    // For 2-player game, state commitment = pedersen_hash of:
    // [stackP1, stackP2, pot, street, currentPlayer, lastAction, lastBetSize, streetBetP1, streetBetP2, status, dealer]
    if (players.length === 2) {
      const inputs = [
        BigInt(players[0].stack),
        BigInt(players[1].stack),
        BigInt(state.pot),
        BigInt(state.street),
        BigInt(state.actionPos === players[0].seatIndex ? 1 : 2),
        BigInt(0), // lastAction - would need tracking
        BigInt(state.lastRaiseAmount),
        BigInt(players[0].streetBet),
        BigInt(players[1].streetBet),
        BigInt(state.status === GameStatus.BETTING ? 1 : state.status === GameStatus.FINISHED ? 2 : 0),
        BigInt(state.buttonPos === players[0].seatIndex ? 1 : 2),
      ];
      const hash = pedersenHash(inputs);
      return '0x' + hash.toString(16).padStart(64, '0');
    }

    // For N-player, use simplified commitment
    const basicInputs = [
      BigInt(state.pot),
      BigInt(state.street),
      BigInt(state.actionPos),
      BigInt(state.buttonPos),
    ];
    const hash = pedersenHash(basicInputs);
    return '0x' + hash.toString(16).padStart(64, '0');
  }

  /**
   * Compute player hash from public key
   */
  private computePlayerHash(publicKey: Point): string {
    const hash = pedersenHash([publicKey.x, publicKey.y]);
    return '0x' + hash.toString(16).padStart(64, '0');
  }

  getStatus(): RoomStatus {
    return this.status;
  }

  getPlayerCount(): number {
    return this.players.size;
  }

  getPlayerIds(): string[] {
    return Array.from(this.players.keys());
  }

  getPlayers(): RoomPlayer[] {
    return Array.from(this.players.values());
  }

  hasPlayer(playerId: string): boolean {
    return this.players.has(playerId);
  }

  private findNextSeat(): number {
    const takenSeats = new Set(Array.from(this.players.values()).map(p => p.seatIndex));
    for (let i = 0; i < this.config.maxPlayers; i++) {
      if (!takenSeats.has(i)) return i;
    }
    return -1;
  }

  addPlayer(playerId: string, name: string, publicKey: Point): { success: boolean; seatIndex?: number; error?: string } {
    if (this.status !== RoomStatus.WAITING) {
      return { success: false, error: 'Game already in progress' };
    }

    if (this.players.size >= this.config.maxPlayers) {
      return { success: false, error: 'Room is full' };
    }

    if (this.players.has(playerId)) {
      return { success: false, error: 'Already in room' };
    }

    const seatIndex = this.findNextSeat();
    if (seatIndex === -1) {
      return { success: false, error: 'No seats available' };
    }

    this.players.set(playerId, {
      id: playerId,
      name,
      seatIndex,
      isReady: false,
      publicKey,
    });

    connectionManager.setPlayerRoom(playerId, this.id);
    logger.info('Player joined room', { roomId: this.id, playerId, seatIndex });

    this.broadcastExcept(playerId, {
      type: 'player_joined',
      playerId,
      playerName: name,
      seatIndex,
    });

    connectionManager.send(playerId, {
      type: 'room_joined',
      roomId: this.id,
      playerId,
      seatIndex,
      players: this.getPlayers().map(p => ({
        id: p.id,
        name: p.name,
        seatIndex: p.seatIndex,
        isReady: p.isReady,
        isConnected: connectionManager.isConnected(p.id),
      })),
      config: this.config,
    });

    return { success: true, seatIndex };
  }

  removePlayer(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;

    this.players.delete(playerId);
    connectionManager.setPlayerRoom(playerId, null);
    logger.info('Player left room', { roomId: this.id, playerId });

    this.broadcast({
      type: 'player_left',
      playerId,
      seatIndex: player.seatIndex,
    });

    if (this.status === RoomStatus.IN_GAME && this.engine) {
      const enginePlayer = this.engine.getPlayerById(playerId);
      if (enginePlayer) {
        enginePlayer.folded = true;
        enginePlayer.isConnected = false;
      }

      const activePlayers = this.engine.getActivePlayers();
      if (activePlayers.length <= 1) {
        this.endGame('fold');
      }
    }

    if (this.players.size === 0) {
      this.status = RoomStatus.CLOSED;
    }
  }

  setPlayerReady(playerId: string, isReady: boolean): void {
    const player = this.players.get(playerId);
    if (!player) return;

    player.isReady = isReady;
    connectionManager.setPlayerReady(playerId, isReady);

    this.broadcast({
      type: 'player_ready',
      playerId,
      isReady,
    });

    this.checkStartConditions();
  }

  private checkStartConditions(): void {
    if (this.status !== RoomStatus.WAITING) return;

    const readyPlayers = this.getPlayers().filter(p => p.isReady);
    if (readyPlayers.length >= this.config.minPlayers && readyPlayers.length === this.players.size) {
      this.startGame();
    }
  }

  private startGame(): void {
    logger.info('Starting game', { roomId: this.id, playerCount: this.players.size });
    this.status = RoomStatus.IN_GAME;

    const playerStates: PlayerState[] = this.getPlayers()
      .sort((a, b) => a.seatIndex - b.seatIndex)
      .map(p => createPlayerState(p.id, p.seatIndex, this.config.startingStack, p.publicKey));

    this.engine = new GameEngine(playerStates, this.config);

    // Reset tracking
    this.unmaskTrackers.clear();
    this.holeCardIndices.clear();
    this.handReveals.clear();

    this.broadcast({
      type: 'game_started',
      gameState: this.serializeGameState(),
    });

    this.startShufflePhase();
  }

  private startShufflePhase(): void {
    if (!this.engine) return;

    const state = this.engine.getState();
    state.status = GameStatus.SHUFFLE;
    state.currentShuffler = 0;

    const players = this.getPlayers().sort((a, b) => a.seatIndex - b.seatIndex);
    const shuffler = players[0];
    if (shuffler) {
      this.broadcast({
        type: 'shuffle_turn',
        playerId: shuffler.id,
        seatIndex: shuffler.seatIndex,
        currentDeck: [],
      });
    }
  }

  async submitShuffle(
    playerId: string,
    shuffledDeck: any[],
    deckCommitmentAfter: string,
    proof?: string,
    publicWitness?: string
  ): Promise<void> {
    if (!this.engine) return;

    const state = this.engine.getState();
    if (state.status !== GameStatus.SHUFFLE) {
      connectionManager.send(playerId, {
        type: 'error',
        code: 'INVALID_STATE',
        message: 'Not in shuffle phase',
      });
      return;
    }

    const players = this.getPlayers().sort((a, b) => a.seatIndex - b.seatIndex);
    const currentShuffler = players[state.currentShuffler];

    if (!currentShuffler || currentShuffler.id !== playerId) {
      connectionManager.send(playerId, {
        type: 'error',
        code: 'NOT_YOUR_TURN',
        message: 'Not your turn to shuffle',
      });
      return;
    }

    // Parse the shuffled deck
    const parsedDeck: Card[] = shuffledDeck.map(card => ({
      epk: { x: BigInt(card.epkX), y: BigInt(card.epkY), isInfinity: card.epkX === '0' && card.epkY === '0' },
      msg: { x: BigInt(card.msgX), y: BigInt(card.msgY), isInfinity: false },
      pk: { x: BigInt(card.pkX), y: BigInt(card.pkY), isInfinity: card.pkX === '0' && card.pkY === '0' },
    }));

    // Verify proof if provided
    // First player uses 'shuffle' circuit, subsequent players use 'reshuffle' circuit
    if (proof && publicWitness) {
      const circuitName = state.currentShuffler === 0 ? 'shuffle' : 'reshuffle';
      logger.info(`Verifying ${circuitName} proof`, { playerId, roomId: this.id, shufflerIndex: state.currentShuffler });

      const verifyResult = await proofVerifier.verify(circuitName, proof, publicWitness);

      if (!verifyResult.valid) {
        logger.warn(`${circuitName} proof verification failed`, {
          playerId,
          roomId: this.id,
          error: verifyResult.error
        });
        connectionManager.send(playerId, {
          type: 'error',
          code: 'INVALID_PROOF',
          message: `${circuitName} proof verification failed: ${verifyResult.error}`,
        });
        return;
      }

      logger.info(`${circuitName} proof verified successfully`, { playerId, roomId: this.id });
    } else {
      // For now, allow without proof but log warning
      logger.warn('Shuffle submitted without proof', { playerId, roomId: this.id });
    }

    // Update deck state
    state.deck = parsedDeck;

    // Update deck commitment
    this.deckCommitment = deckCommitmentAfter;

    // Store individual card commitments for unmask verification
    for (let i = 0; i < parsedDeck.length; i++) {
      const cardCommit = this.computeCardCommitment(parsedDeck[i]);
      this.cardCommitments.set(i, '0x' + cardCommit.toString(16).padStart(64, '0'));
    }

    this.broadcast({
      type: 'shuffle_complete',
      playerId,
      deckCommitment: deckCommitmentAfter,
    });

    state.currentShuffler++;
    if (state.currentShuffler >= players.length) {
      this.startDealingPhase();
    } else {
      const nextShuffler = players[state.currentShuffler];
      this.broadcast({
        type: 'shuffle_turn',
        playerId: nextShuffler.id,
        seatIndex: nextShuffler.seatIndex,
        currentDeck: this.serializeDeck(state.deck),
      });
    }
  }

  private startDealingPhase(): void {
    if (!this.engine) return;

    const state = this.engine.getState();
    state.status = GameStatus.DEALING;

    const numPlayers = state.players.length;
    const players = this.getPlayers().sort((a, b) => a.seatIndex - b.seatIndex);

    // Deal 2 hole cards to each player
    for (let i = 0; i < players.length; i++) {
      const cardIndices = [i, i + numPlayers];
      this.holeCardIndices.set(players[i].id, cardIndices);
      connectionManager.send(players[i].id, {
        type: 'cards_dealt',
        yourCards: cardIndices,
      });
    }

    this.startUnmaskPhase();
  }

  private startUnmaskPhase(): void {
    if (!this.engine) return;

    const state = this.engine.getState();
    const numPlayers = state.players.length;
    const players = this.getPlayers().sort((a, b) => a.seatIndex - b.seatIndex);

    // Initialize unmask trackers for all hole cards
    for (let cardOwnerIdx = 0; cardOwnerIdx < numPlayers; cardOwnerIdx++) {
      const cardOwner = players[cardOwnerIdx];
      for (let cardIdx = 0; cardIdx < 2; cardIdx++) {
        const cardIndex = cardOwnerIdx + (cardIdx * numPlayers);
        const key = `${cardIndex}`;

        // Each card needs to be unmasked by all OTHER players
        // For hole cards, all other players unmask in parallel (since there's typically just 1 other player in 2-player)
        const otherPlayers = players.filter(p => p.id !== cardOwner.id).map(p => p.id);

        this.unmaskTrackers.set(key, {
          cardIndex,
          forPlayerId: cardOwner.id,
          unmaskedBy: new Set(),
          currentCard: state.deck[cardIndex] || null,
          pendingPlayers: [], // For hole cards, we send to all at once
        });

        // Request each player to unmask this card (except the owner)
        // Include the card data so clients don't rely on outdated local decks
        const cardToUnmask = state.deck[cardIndex];
        for (const player of players) {
          if (player.id !== cardOwner.id) {
            connectionManager.send(player.id, {
              type: 'unmask_request',
              cardIndex,
              forPlayerId: cardOwner.id,
              card: cardToUnmask ? this.serializeCard(cardToUnmask) : undefined,
            });
          }
        }
      }
    }

    logger.info('Unmask phase started', {
      roomId: this.id,
      totalCards: this.unmaskTrackers.size,
      playersNeededPerCard: numPlayers - 1,
    });
  }

  async submitUnmask(
    playerId: string,
    cardIndex: number,
    unmaskedCard: any,
    proof?: string,
    publicWitness?: string
  ): Promise<void> {
    if (!this.engine) return;

    // Check for both regular cards and community cards
    let key = `${cardIndex}`;
    let tracker = this.unmaskTrackers.get(key);

    // If not found, check for community card
    if (!tracker) {
      key = `community_${cardIndex}`;
      tracker = this.unmaskTrackers.get(key);
    }

    if (!tracker) {
      connectionManager.send(playerId, {
        type: 'error',
        code: 'INVALID_CARD',
        message: 'Invalid card index for unmask',
      });
      return;
    }

    const isCommunityCard = tracker.forPlayerId === 'community';

    // Player should not unmask their own cards (except community cards)
    if (!isCommunityCard && tracker.forPlayerId === playerId) {
      connectionManager.send(playerId, {
        type: 'error',
        code: 'INVALID_UNMASK',
        message: 'Cannot unmask your own card',
      });
      return;
    }

    // Check if already unmasked by this player
    if (tracker.unmaskedBy.has(playerId)) {
      connectionManager.send(playerId, {
        type: 'error',
        code: 'ALREADY_UNMASKED',
        message: 'Already submitted unmask for this card',
      });
      return;
    }

    // Parse the unmasked card
    const parsedCard: Card = {
      epk: { x: BigInt(unmaskedCard.epkX), y: BigInt(unmaskedCard.epkY), isInfinity: unmaskedCard.epkX === '0' && unmaskedCard.epkY === '0' },
      msg: { x: BigInt(unmaskedCard.msgX), y: BigInt(unmaskedCard.msgY), isInfinity: false },
      pk: { x: BigInt(unmaskedCard.pkX), y: BigInt(unmaskedCard.pkY), isInfinity: unmaskedCard.pkX === '0' && unmaskedCard.pkY === '0' },
    };

    // Verify unmask proof if provided
    if (proof && publicWitness) {
      logger.info('Verifying unmask proof', { playerId, cardIndex, roomId: this.id });

      const verifyResult = await proofVerifier.verify('unmask', proof, publicWitness);

      if (!verifyResult.valid) {
        logger.warn('Unmask proof verification failed', {
          playerId,
          cardIndex,
          roomId: this.id,
          error: verifyResult.error
        });
        connectionManager.send(playerId, {
          type: 'error',
          code: 'INVALID_PROOF',
          message: `Unmask proof verification failed: ${verifyResult.error}`,
        });
        return;
      }

      logger.info('Unmask proof verified successfully', { playerId, cardIndex, roomId: this.id });
    } else {
      logger.warn('Unmask submitted without proof', { playerId, cardIndex, roomId: this.id });
    }

    // Update the card state with the partially unmasked card
    tracker.currentCard = parsedCard;

    // Update card commitment for subsequent unmasks
    const newCommitment = this.computeCardCommitment(parsedCard);
    this.cardCommitments.set(cardIndex, '0x' + newCommitment.toString(16).padStart(64, '0'));

    tracker.unmaskedBy.add(playerId);

    logger.debug('Unmask submitted', {
      playerId,
      cardIndex,
      unmaskedCount: tracker.unmaskedBy.size,
      forPlayer: tracker.forPlayerId,
      isCommunityCard,
    });

    // For community cards, broadcast to everyone; for hole cards, only to owner
    if (isCommunityCard) {
      this.broadcast({
        type: 'card_partially_unmasked',
        cardIndex,
        byPlayerId: playerId,
        remainingUnmasks: this.getRequiredUnmaskCount(isCommunityCard) - tracker.unmaskedBy.size,
      } as any);

      // For community cards, send to next player in queue with the updated card
      if (tracker.pendingPlayers.length > 0) {
        const nextPlayer = tracker.pendingPlayers.shift()!;
        connectionManager.send(nextPlayer, {
          type: 'unmask_request',
          cardIndex,
          forPlayerId: 'community',
          card: tracker.currentCard ? this.serializeCard(tracker.currentCard) : undefined,
        } as any);

        logger.info('Community card unmask: sending to next player', {
          roomId: this.id,
          cardIndex,
          nextPlayer,
          remainingPlayers: tracker.pendingPlayers.length,
        });
      } else {
        // All players have been sent requests, check if complete
        this.checkCommunityUnmaskComplete();
      }
    } else {
      connectionManager.send(tracker.forPlayerId, {
        type: 'card_partially_unmasked',
        cardIndex,
        byPlayerId: playerId,
        remainingUnmasks: this.getRequiredUnmaskCount(isCommunityCard) - tracker.unmaskedBy.size,
      } as any);

      // Check if all hole card unmasks are complete
      this.checkHoleCardUnmaskComplete();
    }
  }

  private getRequiredUnmaskCount(isCommunityCard: boolean = false): number {
    // For community cards, all players unmask
    // For hole cards, all players except owner unmask
    return isCommunityCard ? this.players.size : this.players.size - 1;
  }

  private checkHoleCardUnmaskComplete(): void {
    const requiredUnmasks = this.getRequiredUnmaskCount(false);

    // Only check hole card trackers (keys without 'community_' prefix)
    for (const [key, tracker] of this.unmaskTrackers.entries()) {
      if (key.startsWith('community_')) continue;
      if (tracker.unmaskedBy.size < requiredUnmasks) {
        return; // Still waiting for more unmasks
      }
    }

    logger.info('All hole cards unmasked, starting betting', { roomId: this.id });

    // All hole cards are fully unmasked
    // Send final unmasked cards to their owners
    for (const [key, tracker] of this.unmaskTrackers.entries()) {
      if (key.startsWith('community_')) continue;
      if (tracker.currentCard) {
        connectionManager.send(tracker.forPlayerId, {
          type: 'card_fully_unmasked',
          cardIndex: tracker.cardIndex,
          card: this.serializeCard(tracker.currentCard),
        } as any);
      }
    }

    this.startBettingPhase();
  }

  private checkCommunityUnmaskComplete(): void {
    if (!this.engine) return;

    const requiredUnmasks = this.getRequiredUnmaskCount(true);
    const communityTrackers: UnmaskTracker[] = [];

    // Collect community card trackers
    for (const [key, tracker] of this.unmaskTrackers.entries()) {
      if (!key.startsWith('community_')) continue;
      communityTrackers.push(tracker);
      if (tracker.unmaskedBy.size < requiredUnmasks) {
        return; // Still waiting for more unmasks
      }
    }

    const state = this.engine.getState();
    logger.info('Community cards unmasked', { roomId: this.id, street: state.street });

    // All community cards for this street are fully unmasked
    // Broadcast to all players
    const revealedIndices: number[] = [];
    for (const tracker of communityTrackers) {
      if (tracker.currentCard) {
        revealedIndices.push(tracker.cardIndex);
        this.broadcast({
          type: 'card_fully_unmasked',
          cardIndex: tracker.cardIndex,
          card: this.serializeCard(tracker.currentCard),
          isCommunity: true,
        } as any);
      }
    }

    // Clear community trackers for this street
    for (const [key] of this.unmaskTrackers.entries()) {
      if (key.startsWith('community_')) {
        this.unmaskTrackers.delete(key);
      }
    }

    // Broadcast street_advanced message
    this.broadcast({
      type: 'street_advanced',
      street: state.street,
      communityCardIndices: revealedIndices,
    });

    // Continue betting on the new street
    this.notifyCurrentPlayer();
  }

  private startBettingPhase(): void {
    if (!this.engine) return;

    this.engine.postBlinds();
    const state = this.engine.getState();
    state.status = GameStatus.BETTING;

    this.notifyCurrentPlayer();
  }

  private notifyCurrentPlayer(): void {
    if (!this.engine) return;

    const state = this.engine.getState();
    const currentPlayer = this.engine.getPlayerByIndex(state.actionPos);
    if (!currentPlayer) return;

    const validActions = this.engine.getValidActions();
    const amountToCall = this.engine.getAmountToCall(currentPlayer);

    this.broadcast({
      type: 'player_turn',
      playerId: currentPlayer.id,
      seatIndex: state.actionPos,
      validActions,
      minBet: this.engine.getMinBet(),
      minRaise: this.engine.getMinRaise(),
      amountToCall,
      timeoutMs: this.config.turnTimeoutMs,
    });

    this.clearTurnTimeout();
    this.turnTimeoutHandle = setTimeout(() => {
      this.handleTurnTimeout(currentPlayer.id);
    }, this.config.turnTimeoutMs);
  }

  private clearTurnTimeout(): void {
    if (this.turnTimeoutHandle) {
      clearTimeout(this.turnTimeoutHandle);
      this.turnTimeoutHandle = null;
    }
  }

  private handleTurnTimeout(playerId: string): void {
    if (!this.engine) return;

    logger.info('Turn timeout', { roomId: this.id, playerId });

    const result = this.engine.applyAction({
      playerId,
      type: 0, // FOLD
      amount: 0,
    });

    if (result.success) {
      this.onActionComplete(playerId, 0, 0);
    }
  }

  async submitAction(
    playerId: string,
    action: GameAction,
    proof?: string,
    publicWitness?: string
  ): Promise<void> {
    if (!this.engine) return;

    const state = this.engine.getState();
    if (state.status !== GameStatus.BETTING) {
      connectionManager.send(playerId, {
        type: 'error',
        code: 'INVALID_STATE',
        message: 'Not in betting phase',
      });
      return;
    }

    // Compute state commitment before action
    const stateCommitmentBefore = this.computeStateCommitment();

    // Verify action proof if provided
    if (proof && publicWitness) {
      logger.info('Verifying game action proof', { playerId, actionType: action.type, roomId: this.id });

      const verifyResult = await proofVerifier.verify('game_action', proof, publicWitness);

      if (!verifyResult.valid) {
        logger.warn('Game action proof verification failed', {
          playerId,
          actionType: action.type,
          roomId: this.id,
          error: verifyResult.error
        });
        connectionManager.send(playerId, {
          type: 'error',
          code: 'INVALID_PROOF',
          message: `Game action proof verification failed: ${verifyResult.error}`,
        });
        return;
      }

      logger.info('Game action proof verified successfully', { playerId, actionType: action.type, roomId: this.id });
    } else {
      logger.warn('Action submitted without proof', { playerId, actionType: action.type, roomId: this.id });
    }

    const result = this.engine.applyAction(action);
    if (!result.success) {
      connectionManager.send(playerId, {
        type: 'error',
        code: 'INVALID_ACTION',
        message: result.error || 'Invalid action',
      });
      return;
    }

    // Update state commitment after action
    this.stateCommitment = this.computeStateCommitment();

    this.clearTurnTimeout();
    this.onActionComplete(playerId, action.type, action.amount);
  }

  private onActionComplete(playerId: string, actionType: number, amount: number): void {
    if (!this.engine) return;

    const state = this.engine.getState();
    const player = this.engine.getPlayerById(playerId);
    if (!player) return;

    this.broadcast({
      type: 'action_result',
      playerId,
      actionType,
      amount,
      newPot: state.pot,
      playerStack: player.stack,
    });

    if (state.status === GameStatus.FINISHED) {
      this.endGame('fold');
      return;
    }

    if (state.status === GameStatus.SHOWDOWN) {
      this.startShowdown();
      return;
    }

    // Check if street advanced
    if (state.street > this.previousStreet && state.street !== Street.SHOWDOWN) {
      this.handleStreetAdvanced(state.street);
      return;
    }

    const activePlayers = this.engine.getActivePlayers();
    if (activePlayers.length > 1) {
      this.notifyCurrentPlayer();
    } else {
      this.endGame('fold');
    }
  }

  private handleStreetAdvanced(newStreet: Street): void {
    if (!this.engine) return;

    const state = this.engine.getState();
    const numPlayers = state.players.length;
    const holeCardsEnd = numPlayers * 2; // Index where community cards start

    // Determine which community cards to deal based on the new street
    let cardIndicesToDeal: number[] = [];

    switch (newStreet) {
      case Street.FLOP:
        // Flop: 3 cards
        cardIndicesToDeal = [holeCardsEnd, holeCardsEnd + 1, holeCardsEnd + 2];
        break;
      case Street.TURN:
        // Turn: 1 card
        cardIndicesToDeal = [holeCardsEnd + 3];
        break;
      case Street.RIVER:
        // River: 1 card
        cardIndicesToDeal = [holeCardsEnd + 4];
        break;
    }

    logger.info('Street advanced, dealing community cards', {
      roomId: this.id,
      newStreet,
      cardIndicesToDeal,
    });

    this.previousStreet = newStreet;
    this.communityCardIndices.push(...cardIndicesToDeal);

    // Start unmask process for community cards
    // Community cards need to be revealed to everyone
    if (cardIndicesToDeal.length > 0) {
      this.dealCommunityCards(cardIndicesToDeal);
    }
  }

  private dealCommunityCards(cardIndices: number[]): void {
    if (!this.engine) return;

    const state = this.engine.getState();
    const playerIds = Array.from(this.players.keys());

    // For community cards, ALL players must unmask in sequence
    // Each player receives the card after previous player has unmasked
    for (const cardIndex of cardIndices) {
      const trackerId = `community_${cardIndex}`;

      // pendingPlayers contains players who still need to unmask (excluding first)
      const [firstPlayer, ...remainingPlayers] = playerIds;

      this.unmaskTrackers.set(trackerId, {
        cardIndex,
        forPlayerId: 'community', // Special marker for community cards
        unmaskedBy: new Set(),
        currentCard: state.deck[cardIndex] || null,
        pendingPlayers: remainingPlayers, // Players who will unmask after the first
      });

      // Only send to first player initially
      const cardToUnmask = state.deck[cardIndex];
      connectionManager.send(firstPlayer, {
        type: 'unmask_request',
        cardIndex,
        forPlayerId: 'community',
        card: cardToUnmask ? this.serializeCard(cardToUnmask) : undefined,
      } as any);

      logger.info('Community card unmask started', {
        roomId: this.id,
        cardIndex,
        firstPlayer,
        pendingPlayers: remainingPlayers.length,
      });
    }
  }

  // ========== SHOWDOWN LOGIC ==========

  private startShowdown(): void {
    if (!this.engine) return;

    logger.info('Starting showdown', { roomId: this.id });

    const state = this.engine.getState();
    this.handReveals.clear();

    // Get active players who need to reveal hands
    const activePlayers = state.players.filter(p => !p.folded);

    // Request hand reveals from all active players
    for (const player of activePlayers) {
      connectionManager.send(player.id, {
        type: 'reveal_hand_request',
        pot: state.pot,
        opponents: activePlayers.filter(p => p.id !== player.id).map(p => ({
          id: p.id,
          seatIndex: p.seatIndex,
        })),
      } as any);
    }

    // Set showdown timeout (e.g., 30 seconds to reveal)
    this.showdownTimeoutHandle = setTimeout(() => {
      this.handleShowdownTimeout();
    }, 30000);
  }

  async submitHandReveal(
    playerId: string,
    handRank: number,
    handDescription: string,
    cardIndices: number[],
    proof?: string,
    publicWitness?: string
  ): Promise<void> {
    if (!this.engine) return;

    const state = this.engine.getState();
    if (state.status !== GameStatus.SHOWDOWN) {
      connectionManager.send(playerId, {
        type: 'error',
        code: 'INVALID_STATE',
        message: 'Not in showdown phase',
      });
      return;
    }

    const player = this.engine.getPlayerById(playerId);
    if (!player || player.folded) {
      connectionManager.send(playerId, {
        type: 'error',
        code: 'INVALID_PLAYER',
        message: 'Not eligible for showdown',
      });
      return;
    }

    let verified = false;

    // Verify hand_eval proof if provided
    if (proof && publicWitness) {
      logger.info('Verifying hand eval proof', { playerId, handRank, roomId: this.id });

      const verifyResult = await proofVerifier.verify('hand_eval', proof, publicWitness);

      if (!verifyResult.valid) {
        logger.warn('Hand eval proof verification failed', {
          playerId,
          handRank,
          roomId: this.id,
          error: verifyResult.error
        });
        connectionManager.send(playerId, {
          type: 'error',
          code: 'INVALID_PROOF',
          message: `Hand eval proof verification failed: ${verifyResult.error}`,
        });
        return;
      }

      logger.info('Hand eval proof verified successfully', { playerId, handRank, roomId: this.id });
      verified = true;
    } else {
      logger.warn('Hand reveal submitted without proof', { playerId, handRank, roomId: this.id });
    }

    this.handReveals.set(playerId, {
      playerId,
      handRank,
      handDescription,
      cardIndices,
      verified,
    });

    // Broadcast revealed hand to all players
    this.broadcast({
      type: 'hand_revealed',
      playerId,
      handRank,
      handDescription,
      cardIndices,
      verified,
    } as any);

    logger.info('Hand revealed', { roomId: this.id, playerId, handRank, handDescription, verified });

    // Check if all hands are revealed
    this.checkShowdownComplete();
  }

  private checkShowdownComplete(): void {
    if (!this.engine) return;

    const state = this.engine.getState();
    const activePlayers = state.players.filter(p => !p.folded);

    // Check if all active players have revealed
    for (const player of activePlayers) {
      if (!this.handReveals.has(player.id)) {
        return; // Still waiting for reveals
      }
    }

    this.clearShowdownTimeout();
    this.resolveShowdown();
  }

  private handleShowdownTimeout(): void {
    if (!this.engine) return;

    logger.info('Showdown timeout', { roomId: this.id });

    // Players who didn't reveal forfeit
    const state = this.engine.getState();
    const activePlayers = state.players.filter(p => !p.folded);

    for (const player of activePlayers) {
      if (!this.handReveals.has(player.id)) {
        // Mark as folded for not revealing
        player.folded = true;
        this.broadcast({
          type: 'player_forfeited',
          playerId: player.id,
          reason: 'timeout',
        } as any);
      }
    }

    this.resolveShowdown();
  }

  private clearShowdownTimeout(): void {
    if (this.showdownTimeoutHandle) {
      clearTimeout(this.showdownTimeoutHandle);
      this.showdownTimeoutHandle = null;
    }
  }

  private resolveShowdown(): void {
    if (!this.engine) return;

    const state = this.engine.getState();
    const activePlayers = state.players.filter(p => !p.folded);

    // If only one player left (others forfeited), they win
    if (activePlayers.length === 1) {
      const winner = activePlayers[0];
      winner.stack += state.pot;

      this.broadcast({
        type: 'showdown',
        players: [{
          id: winner.id,
          handRank: 0,
          handDescription: 'Winner by forfeit',
          cards: this.holeCardIndices.get(winner.id) || [],
        }],
        winners: [winner.id],
        potDistribution: [{
          playerId: winner.id,
          amount: state.pot,
        }],
      });

      this.endGame('showdown');
      return;
    }

    // Build player hands map for quick lookup
    const playerHands = new Map<string, { handRank: number; handDescription: string; cardIndices: number[] }>();
    for (const player of activePlayers) {
      const reveal = this.handReveals.get(player.id);
      if (reveal) {
        playerHands.set(player.id, {
          handRank: reveal.handRank,
          handDescription: reveal.handDescription,
          cardIndices: reveal.cardIndices,
        });
      }
    }

    // Calculate side pots
    const sidePots = this.engine.calculateSidePots();

    // Track total winnings per player
    const winnings = new Map<string, number>();
    const allWinnerIds = new Set<string>();

    // Distribute each side pot to its winner(s)
    for (const pot of sidePots) {
      // Find best hand among eligible players who revealed
      const eligibleHands = pot.eligiblePlayers
        .filter(id => playerHands.has(id))
        .map(id => ({ id, ...playerHands.get(id)! }))
        .sort((a, b) => b.handRank - a.handRank);

      if (eligibleHands.length === 0) continue;

      // Find all players with the best hand in this pot
      const bestRank = eligibleHands[0].handRank;
      const potWinners = eligibleHands.filter(h => h.handRank === bestRank);

      // Split pot among winners
      const potPerWinner = Math.floor(pot.amount / potWinners.length);
      const remainder = pot.amount % potWinners.length;

      potWinners.forEach((winner, idx) => {
        const amount = potPerWinner + (idx === 0 ? remainder : 0);
        const current = winnings.get(winner.id) || 0;
        winnings.set(winner.id, current + amount);
        allWinnerIds.add(winner.id);
      });
    }

    // Apply winnings to player stacks
    const potDistribution: Array<{ playerId: string; amount: number }> = [];
    for (const [playerId, amount] of winnings) {
      const player = state.players.find(p => p.id === playerId);
      if (player) {
        player.stack += amount;
        potDistribution.push({ playerId, amount });
      }
    }

    // Build showdown players list
    const showdownPlayers = activePlayers
      .map(p => {
        const hand = playerHands.get(p.id);
        return {
          id: p.id,
          handRank: hand?.handRank ?? 0,
          handDescription: hand?.handDescription ?? 'Unknown',
          cards: hand?.cardIndices ?? this.holeCardIndices.get(p.id) ?? [],
        };
      })
      .sort((a, b) => b.handRank - a.handRank);

    // Broadcast showdown results
    this.broadcast({
      type: 'showdown',
      players: showdownPlayers,
      winners: Array.from(allWinnerIds),
      potDistribution,
    });

    logger.info('Showdown resolved', {
      roomId: this.id,
      winners: Array.from(allWinnerIds),
      pot: state.pot,
      sidePots: sidePots.length,
    });

    this.endGame('showdown');
  }

  private endGame(reason: 'showdown' | 'fold' | 'timeout'): void {
    if (!this.engine) return;

    this.clearTurnTimeout();
    this.clearShowdownTimeout();

    const state = this.engine.getState();
    state.status = GameStatus.FINISHED;

    const finalStacks = state.players.map(p => ({
      playerId: p.id,
      stack: p.stack,
    }));

    // If only one player left (all others folded), they win
    const activePlayers = state.players.filter(p => !p.folded);
    if (activePlayers.length === 1 && reason === 'fold') {
      const winner = activePlayers[0];
      const potAmount = state.pot;
      winner.stack += potAmount;
      const winnerStack = finalStacks.find(s => s.playerId === winner.id);
      if (winnerStack) {
        winnerStack.stack = winner.stack;
      }

      // Send explicit fold winner message
      this.broadcast({
        type: 'fold_winner',
        winnerId: winner.id,
        amount: potAmount,
      } as any);
    }

    this.broadcast({
      type: 'game_ended',
      reason,
      finalStacks,
    });

    // Reset for next hand
    this.status = RoomStatus.WAITING;
    this.engine = null;
    this.unmaskTrackers.clear();
    this.holeCardIndices.clear();
    this.handReveals.clear();
    this.previousStreet = Street.PREFLOP;
    this.communityCardIndices = [];

    for (const player of this.players.values()) {
      player.isReady = false;
    }

    logger.info('Game ended, ready for new hand', { roomId: this.id, reason });
  }

  handleDisconnect(playerId: string): void {
    this.removePlayer(playerId);
  }

  private broadcast(message: any): void {
    connectionManager.broadcast(this.getPlayerIds(), message);
  }

  private broadcastExcept(exceptPlayerId: string, message: any): void {
    connectionManager.broadcastExcept(this.getPlayerIds(), exceptPlayerId, message);
  }

  private serializeGameState(): SerializedGameState {
    if (!this.engine) {
      return {
        players: [],
        pot: 0,
        street: 0,
        buttonPos: 0,
        actionPos: 0,
        status: 'waiting',
      };
    }

    const state = this.engine.getState();
    return {
      players: state.players.map(p => ({
        id: p.id,
        seatIndex: p.seatIndex,
        stack: p.stack,
        streetBet: p.streetBet,
        folded: p.folded,
        allIn: p.allIn,
      })),
      pot: state.pot,
      street: state.street,
      buttonPos: state.buttonPos,
      actionPos: state.actionPos,
      status: state.status,
    };
  }

  private serializeDeck(deck: Card[]): SerializedCard[] {
    return deck.map(card => this.serializeCard(card));
  }

  private serializeCard(card: Card): SerializedCard {
    return {
      epkX: card.epk.x.toString(),
      epkY: card.epk.y.toString(),
      msgX: card.msg.x.toString(),
      msgY: card.msg.y.toString(),
      pkX: card.pk.x.toString(),
      pkY: card.pk.y.toString(),
    };
  }
}
