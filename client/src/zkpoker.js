// ZK Poker Game Client - orchestrates proof generation
import { initCrypto, generateKeypair, secretToPublicKey, hash } from './crypto.js';
import { initProver, prove, serializeProof } from './prover.js';
import {
  createDeck,
  shuffleAndMaskDeck,
  partialUnmask,
  commitDeck,
  commitUnmaskedDeck,
  commitCard,
  isUnmasked
} from './cards.js';
import { isInfinity } from './crypto.js';

export class ZKPoker {
  constructor() {
    this.initialized = false;
    this.playerSecret = null;
    this.playerPublicKey = null;
    this.deck = null;
    this.stats = {
      shuffle: 0,
      mask: 0,
      action: 0,
      constraints: 0
    };
    this.onLog = null;
  }

  log(message, type = 'setup') {
    if (this.onLog) {
      this.onLog(message, type);
    }
    console.log(`[ZKPoker] ${message}`);
  }

  // Initialize crypto and prover
  async init() {
    this.log('Initializing cryptographic libraries...', 'crypto');
    await initCrypto();

    this.log('Loading circuit artifacts...', 'crypto');
    await initProver();

    this.initialized = true;
    this.log('ZK Poker initialized', 'setup');
    return true;
  }

  // Generate player keys
  async generateKeys() {
    this.log('Generating player keypair...', 'crypto');
    const { privateKey, publicKey } = await generateKeypair();
    this.playerSecret = privateKey;
    this.playerPublicKey = publicKey;
    this.log(`Public key: [${publicKey[0].toString().slice(0, 20)}...]`, 'crypto');
    return publicKey;
  }

  // Create initial deck
  async createInitialDeck() {
    this.log('Creating initial deck...', 'setup');
    this.deck = await createDeck();
    this.log('52 card points generated', 'setup');
    return this.deck;
  }

  // Shuffle deck with proof
  async shuffleDeck(inputDeck = null) {
    const deck = inputDeck || this.deck;
    if (!deck) throw new Error('No deck to shuffle');

    this.log('Shuffling and masking deck...', 'crypto');
    const { shuffledDeck, permutation, nonces } = await shuffleAndMaskDeck(deck, this.playerSecret);

    // Use commitUnmaskedDeck for initial deck (epk=pk=0,0)
    const deckCommitmentBefore = await commitUnmaskedDeck(deck);
    const deckCommitmentAfter = await commitDeck(shuffledDeck);

    // Prepare inputs for shuffle circuit
    const cardsBefore = deck.map(c => [c.msg[0].toString(), c.msg[1].toString()]);
    const cardsAfter = shuffledDeck.map(c => [
      c.epk[0].toString(), c.epk[1].toString(),
      c.msg[0].toString(), c.msg[1].toString(),
      c.pk[0].toString(), c.pk[1].toString()
    ]);

    const inputs = {
      deckCommitmentBefore: deckCommitmentBefore.toString(),
      deckCommitmentAfter: deckCommitmentAfter.toString(),
      playerPubX: this.playerPublicKey[0].toString(),
      playerPubY: this.playerPublicKey[1].toString(),
      cardsBefore,
      cardsAfter,
      permutation: permutation.map(String),
      playerSecret: this.playerSecret.toString(),
      nonces: nonces.map(n => n.toString())
    };

    this.log('Generating shuffle proof (740K constraints)...', 'proof');
    const startTime = performance.now();
    const { proof, publicSignals } = await prove('shuffle', inputs);
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

    this.stats.shuffle++;
    this.stats.constraints += 740000;
    this.log(`Shuffle proof generated in ${elapsed}s ✓`, 'proof');

    this.deck = shuffledDeck;
    return {
      shuffledDeck,
      proof: serializeProof(proof, publicSignals),
      deckCommitment: deckCommitmentAfter
    };
  }

  // Re-shuffle already-masked deck (for player 2+)
  async reshuffleDeck(inputDeck) {
    if (!inputDeck || inputDeck.length !== 52) {
      throw new Error('Invalid input deck for reshuffle');
    }

    this.log('Re-shuffling masked deck...', 'crypto');

    // Import reshuffleAndMaskDeck from cards.js
    const { reshuffleAndMaskDeck } = await import('./cards.js');
    const { shuffledDeck, permutation, nonces } = await reshuffleAndMaskDeck(inputDeck, this.playerSecret);

    const deckCommitmentBefore = await commitDeck(inputDeck);
    const deckCommitmentAfter = await commitDeck(shuffledDeck);

    // Prepare inputs for reshuffle circuit (full 6 fields per card)
    const cardsBefore = inputDeck.map(c => [
      c.epk[0].toString(), c.epk[1].toString(),
      c.msg[0].toString(), c.msg[1].toString(),
      c.pk[0].toString(), c.pk[1].toString()
    ]);
    const cardsAfter = shuffledDeck.map(c => [
      c.epk[0].toString(), c.epk[1].toString(),
      c.msg[0].toString(), c.msg[1].toString(),
      c.pk[0].toString(), c.pk[1].toString()
    ]);

    const inputs = {
      deckCommitmentBefore: deckCommitmentBefore.toString(),
      deckCommitmentAfter: deckCommitmentAfter.toString(),
      playerPubX: this.playerPublicKey[0].toString(),
      playerPubY: this.playerPublicKey[1].toString(),
      cardsBefore,
      cardsAfter,
      permutation: permutation.map(String),
      playerSecret: this.playerSecret.toString(),
      nonces: nonces.map(n => n.toString())
    };

    this.log('Generating reshuffle proof (773K constraints)...', 'proof');
    const startTime = performance.now();
    const { proof, publicSignals } = await prove('reshuffle', inputs);
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

    this.stats.shuffle++;
    this.stats.constraints += 773000;
    this.log(`Reshuffle proof generated in ${elapsed}s ✓`, 'proof');

    this.deck = shuffledDeck;
    return {
      shuffledDeck,
      proof: serializeProof(proof, publicSignals),
      deckCommitment: deckCommitmentAfter
    };
  }

  // Add player keys to deck without shuffling (simpler alternative)
  async addKeysToDeck(inputDeck) {
    if (!inputDeck || inputDeck.length !== 52) {
      throw new Error('Invalid input deck');
    }

    this.log('Adding player keys to deck...', 'crypto');

    const { addPlayerKeysToDeck } = await import('./cards.js');
    const { updatedDeck, pkIsInfBefore } = await addPlayerKeysToDeck(inputDeck, this.playerSecret);

    const deckCommitmentBefore = await commitDeck(inputDeck);
    const deckCommitmentAfter = await commitDeck(updatedDeck);

    const cardsBefore = inputDeck.map(c => [
      c.epk[0].toString(), c.epk[1].toString(),
      c.msg[0].toString(), c.msg[1].toString(),
      c.pk[0].toString(), c.pk[1].toString()
    ]);
    const cardsAfter = updatedDeck.map(c => [
      c.epk[0].toString(), c.epk[1].toString(),
      c.msg[0].toString(), c.msg[1].toString(),
      c.pk[0].toString(), c.pk[1].toString()
    ]);

    const inputs = {
      deckCommitmentBefore: deckCommitmentBefore.toString(),
      deckCommitmentAfter: deckCommitmentAfter.toString(),
      playerPubX: this.playerPublicKey[0].toString(),
      playerPubY: this.playerPublicKey[1].toString(),
      cardsBefore,
      cardsAfter,
      pkIsInfBefore: pkIsInfBefore.map(v => v ? '1' : '0'),
      playerSecret: this.playerSecret.toString()
    };

    this.log('Generating add_keys proof (247K constraints)...', 'proof');
    const startTime = performance.now();
    const { proof, publicSignals } = await prove('add_keys', inputs);
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

    this.stats.shuffle++;
    this.stats.constraints += 247000;
    this.log(`Add keys proof generated in ${elapsed}s ✓`, 'proof');

    this.deck = updatedDeck;
    return {
      updatedDeck,
      proof: serializeProof(proof, publicSignals),
      deckCommitment: deckCommitmentAfter
    };
  }

  // Unmask a card with proof
  async unmaskCard(card, cardIndex) {
    this.log(`Unmasking card at position ${cardIndex}...`, 'crypto');

    const cardBefore = card;
    const cardAfter = await partialUnmask(card, this.playerSecret);

    const inputCommitment = await commitCard(cardBefore);
    const outputCommitment = await commitCard(cardAfter);

    // Circuit input names match unmask.circom
    const inputs = {
      // Public inputs
      inputCardCommitment: inputCommitment.toString(),
      outputCardCommitment: outputCommitment.toString(),
      playerPubX: this.playerPublicKey[0].toString(),
      playerPubY: this.playerPublicKey[1].toString(),
      // Private inputs
      inputEpkX: cardBefore.epk[0].toString(),
      inputEpkY: cardBefore.epk[1].toString(),
      inputMsgX: cardBefore.msg[0].toString(),
      inputMsgY: cardBefore.msg[1].toString(),
      inputPkX: cardBefore.pk[0].toString(),
      inputPkY: cardBefore.pk[1].toString(),
      playerSecret: this.playerSecret.toString()
    };

    this.log('Generating unmask proof (11K constraints)...', 'proof');
    const startTime = performance.now();
    const { proof, publicSignals } = await prove('unmask', inputs);
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

    this.stats.mask++;
    this.stats.constraints += 11000;
    this.log(`Unmask proof generated in ${elapsed}s ✓`, 'proof');

    return {
      unmaskedCard: cardAfter,
      isFullyUnmasked: isUnmasked(cardAfter),
      proof: serializeProof(proof, publicSignals)
    };
  }

  // Generate game action proof
  async proveGameAction(stateBefore, stateAfter, action) {
    this.log(`Proving game action: ${action.type}...`, 'crypto');

    const stateBeforeCommitment = await this.commitGameState(stateBefore);
    const stateAfterCommitment = await this.commitGameState(stateAfter);

    const playerHash = await hash([this.playerPublicKey[0], this.playerPublicKey[1]]);

    const inputs = {
      // State before
      stackP1Before: stateBefore.stackP1.toString(),
      stackP2Before: stateBefore.stackP2.toString(),
      pot: stateBefore.pot.toString(),
      street: stateBefore.street.toString(),
      currentPlayer: stateBefore.currentPlayer.toString(),
      lastAction: stateBefore.lastAction.toString(),
      lastBetSize: stateBefore.lastBetSize.toString(),
      streetBetP1: stateBefore.streetBetP1.toString(),
      streetBetP2: stateBefore.streetBetP2.toString(),
      status: stateBefore.status.toString(),
      dealer: stateBefore.dealer.toString(),

      // Action
      actionType: action.type.toString(),
      betSize: (action.amount || 0).toString(),
      playerIndex: action.playerIndex.toString(),
      playerSecret: this.playerSecret.toString(),

      // State after
      stackP1After: stateAfter.stackP1.toString(),
      stackP2After: stateAfter.stackP2.toString(),
      potAfter: stateAfter.pot.toString(),
      streetAfter: stateAfter.street.toString(),
      currentPlayerAfter: stateAfter.currentPlayer.toString(),
      lastActionAfter: stateAfter.lastAction.toString(),
      lastBetSizeAfter: stateAfter.lastBetSize.toString(),
      streetBetP1After: stateAfter.streetBetP1.toString(),
      streetBetP2After: stateAfter.streetBetP2.toString(),
      statusAfter: stateAfter.status.toString()
    };

    this.log('Generating game action proof (1.3K constraints)...', 'proof');
    const startTime = performance.now();
    const { proof, publicSignals } = await prove('game_action', inputs);
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

    this.stats.action++;
    this.stats.constraints += 1300;
    this.log(`Game action proof generated in ${elapsed}s ✓`, 'proof');

    return {
      stateCommitment: stateAfterCommitment,
      proof: serializeProof(proof, publicSignals)
    };
  }

  // Commit game state
  async commitGameState(state) {
    return await hash([
      BigInt(state.stackP1),
      BigInt(state.stackP2),
      BigInt(state.pot),
      BigInt(state.street),
      BigInt(state.currentPlayer),
      BigInt(state.lastAction),
      BigInt(state.lastBetSize),
      BigInt(state.streetBetP1),
      BigInt(state.streetBetP2),
      BigInt(state.status),
      BigInt(state.dealer)
    ]);
  }

  // Get current stats
  getStats() {
    return { ...this.stats };
  }
}

// Export singleton instance
export const zkPoker = new ZKPoker();
