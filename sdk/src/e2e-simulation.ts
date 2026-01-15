/**
 * End-to-End ZK Poker Simulation
 *
 * Demonstrates a complete poker hand flow:
 * 1. Setup: Create deck, generate player keys
 * 2. Shuffle: Each player shuffles and masks the deck
 * 3. Deal: Deal hole cards to players
 * 4. Unmask: Players unmask their own cards
 * 5. Betting: Players take actions (bet, call, fold, raise)
 * 6. Generate Prover.toml files for each circuit
 */

import {
  createGameState,
  postBlinds,
  applyAction,
  gameStateCommitment,
  pedersenHash,
  generateGameActionProverToml,
  generateShuffleProverToml,
  cardCommitment as maskedCardCommitment,
  randomPermutation,
  randomScalarPair,
  toHex,
  ACTION_CALL,
  ACTION_BET,
  ACTION_FOLD,
  ACTION_RAISE,
  ACTION_CHECK,
} from './game-state.js';
import {
  addPlayerAndMask,
  partialUnmask,
  secretToPublicKey,
  randomScalar,
} from './elgamal.js';
import {
  createCard,
  cardCommitment,
} from './card.js';
import { CARD_PRIMES } from './cards.js';
import { scalarFromBigint, scalarToBigint, type Scalar as GrumpkinScalar } from './grumpkin.js';
import type { GameState, Action, Scalar, MaskedCard } from './types.js';
import type { Card } from './card.js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================
// Configuration
// ============================================================

const STARTING_STACK = 100;
const SMALL_BLIND = 1;
const BIG_BLIND = 2;
const NUM_CARDS = 52;

// ============================================================
// Helper Functions
// ============================================================

function printDivider(title: string) {
  console.log('\n' + '='.repeat(60));
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

function printCard(index: number): string {
  const suits = ['♥', '♦', '♣', '♠'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const suit = suits[Math.floor(index / 13)];
  const rank = ranks[index % 13];
  return `${rank}${suit}`;
}

function printHand(indices: number[]): string {
  return indices.map(printCard).join(' ');
}

// ============================================================
// Simulation Classes
// ============================================================

interface Player {
  id: number;
  name: string;
  secret: GrumpkinScalar;  // Scalar from grumpkin.ts
  publicKey: { x: bigint; y: bigint };
  holeCards: number[];  // Card indices after unmasking
}

// Helper: convert Card from card.ts to MaskedCard for game-state.ts compatibility
function cardToMaskedCard(card: Card): MaskedCard {
  return {
    epk: { x: card.epk.x, y: card.epk.y, isInfinite: card.epk.isInfinity },
    msg: { x: card.msg.x, y: card.msg.y },
    pk: { x: card.pk.x, y: card.pk.y, isInfinite: card.pk.isInfinity },
  };
}

class PokerSimulation {
  players: Player[] = [];
  deck: Card[] = [];
  shuffledDeck: Card[] = [];
  gameState: GameState;
  outputDir: string;

  constructor(outputDir: string) {
    this.outputDir = outputDir;
    this.gameState = createGameState(STARTING_STACK, STARTING_STACK, 1);

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  }

  // Setup players
  setupPlayers() {
    printDivider('SETUP: Creating Players');

    for (let i = 1; i <= 2; i++) {
      const secret = randomScalar();
      const publicKey = secretToPublicKey(secret);
      const player: Player = {
        id: i,
        name: `Player ${i}`,
        secret,
        publicKey: { x: publicKey.x, y: publicKey.y },
        holeCards: [],
      };
      this.players.push(player);
      const secretBigint = scalarToBigint(secret);
      console.log(`  ${player.name}:`);
      console.log(`    Secret: 0x${secretBigint.toString(16).slice(0, 16)}...`);
      console.log(`    Public: (0x${publicKey.x.toString(16).slice(0, 12)}..., 0x${publicKey.y.toString(16).slice(0, 12)}...)`);
    }
  }

  // Create initial unmasked deck
  createDeck() {
    printDivider('SETUP: Creating Deck');

    this.deck = [];
    for (let i = 0; i < NUM_CARDS; i++) {
      this.deck.push(createCard(i));
    }
    console.log(`  Created ${NUM_CARDS} unmasked cards`);
    console.log(`  Sample cards: ${printHand([0, 13, 26, 39])} (2s of each suit)`);
  }

  // Shuffle and mask by a player
  shuffleByPlayer(player: Player, inputDeck: Card[]): Card[] {
    console.log(`\n  ${player.name} shuffling...`);

    // Generate random permutation
    const permutation = randomPermutation(NUM_CARDS);
    console.log(`    Permutation sample: [${permutation.slice(0, 5).join(', ')}...]`);

    // Generate random nonces
    const nonces: GrumpkinScalar[] = [];
    for (let i = 0; i < NUM_CARDS; i++) {
      nonces.push(randomScalar());
    }

    // Apply shuffle and mask
    const outputDeck: Card[] = [];
    for (let i = 0; i < NUM_CARDS; i++) {
      const origIdx = permutation[i];
      const masked = addPlayerAndMask(inputDeck[origIdx], player.secret, nonces[i]);
      outputDeck.push(masked);
    }

    console.log(`    Shuffled and masked ${NUM_CARDS} cards`);

    // Generate Prover.toml - convert to MaskedCard for compatibility
    const toml = generateShuffleProverToml({
      cardsBefore: inputDeck.map(cardToMaskedCard),
      permutation,
      playerSecret: { lo: player.secret.lo, hi: player.secret.hi },
      nonces: nonces.map(n => ({ lo: n.lo, hi: n.hi })),
      maskedCards: outputDeck.map(cardToMaskedCard),
    });

    const filename = `shuffle_player${player.id}.toml`;
    fs.writeFileSync(path.join(this.outputDir, filename), toml);
    console.log(`    Generated ${filename}`);

    return outputDeck;
  }

  // Complete shuffle phase (both players)
  shufflePhase() {
    printDivider('SHUFFLE PHASE');

    // Player 1 shuffles
    let currentDeck = this.shuffleByPlayer(this.players[0], this.deck);

    // Player 2 shuffles
    currentDeck = this.shuffleByPlayer(this.players[1], currentDeck);

    this.shuffledDeck = currentDeck;
    console.log('\n  Shuffle complete - deck is fully masked by both players');
  }

  // Deal hole cards
  dealCards() {
    printDivider('DEAL PHASE');

    // In Texas Hold'em, each player gets 2 cards
    // Player 1 gets cards 0, 2
    // Player 2 gets cards 1, 3
    this.players[0].holeCards = [0, 2];
    this.players[1].holeCards = [1, 3];

    console.log(`  ${this.players[0].name} receives cards at positions 0, 2`);
    console.log(`  ${this.players[1].name} receives cards at positions 1, 3`);
  }

  // Generate unmask Prover.toml for a card
  generateUnmaskToml(player: Player, cardPosition: number, inputCard: Card, outputCard: Card) {
    const inputCommitment = cardCommitment(inputCard);
    const outputCommitment = cardCommitment(outputCard);

    const toml = `# circuit_unmask Prover.toml
# Player ${player.id} unmasking card at position ${cardPosition}

input_card_commitment = ${toHex(inputCommitment)}
output_card_commitment = ${toHex(outputCommitment)}
player_pub_x = ${toHex(player.publicKey.x)}
player_pub_y = ${toHex(player.publicKey.y)}

input_epk_x = ${toHex(inputCard.epk.x)}
input_epk_y = ${toHex(inputCard.epk.y)}
input_msg_x = ${toHex(inputCard.msg.x)}
input_msg_y = ${toHex(inputCard.msg.y)}
input_pk_x = ${toHex(inputCard.pk.x)}
input_pk_y = ${toHex(inputCard.pk.y)}

player_secret_lo = ${toHex(player.secret.lo)}
player_secret_hi = ${toHex(player.secret.hi)}
`;

    const filename = `unmask_p${player.id}_pos${cardPosition}.toml`;
    fs.writeFileSync(path.join(this.outputDir, filename), toml);
    return filename;
  }

  // Unmask phase - each player unmasks their cards
  unmaskPhase() {
    printDivider('UNMASK PHASE');

    for (const player of this.players) {
      console.log(`\n  ${player.name} unmasking hole cards:`);

      for (const cardPos of player.holeCards) {
        // Get the masked card
        let card = this.shuffledDeck[cardPos];

        // Both players need to unmask
        for (const p of this.players) {
          const unmasked = partialUnmask(card, p.secret);

          // Generate Prover.toml
          const filename = this.generateUnmaskToml(p, cardPos, card, unmasked);
          console.log(`    ${p.name} partial unmask for card ${cardPos}: ${filename}`);

          card = unmasked;
        }

        // After both players unmask, pk should be infinity
        if (card.pk.isInfinity) {
          console.log(`    Card ${cardPos} fully unmasked`);
        }
      }
    }
  }

  // Post blinds and setup betting
  postBlinds() {
    printDivider('BETTING: Post Blinds');

    this.gameState = postBlinds(this.gameState, SMALL_BLIND, BIG_BLIND);

    const dealer = this.players[this.gameState.dealer - 1];
    const sb = this.players[this.gameState.dealer === 1 ? 0 : 1];
    const bb = this.players[this.gameState.dealer === 1 ? 1 : 0];

    console.log(`  Dealer: ${dealer.name}`);
    console.log(`  ${sb.name} posts small blind: ${SMALL_BLIND}`);
    console.log(`  ${bb.name} posts big blind: ${BIG_BLIND}`);
    console.log(`  Pot: ${this.gameState.pot}`);
    console.log(`  Stacks: P1=${this.gameState.stackP1}, P2=${this.gameState.stackP2}`);
  }

  // Execute and record a betting action
  executeAction(actionType: number, amount: number = 0) {
    const currentPlayer = this.players[this.gameState.currentPlayer - 1];
    const action: Action = { actionType, amount };

    const actionNames: Record<number, string> = {
      1: 'BET',
      2: 'CALL',
      3: 'FOLD',
      4: 'RAISE',
      5: 'CHECK',
      6: 'ALL-IN',
    };

    const stateBefore = { ...this.gameState };
    const stateAfter = applyAction(this.gameState, action);

    const actionStr = amount > 0
      ? `${actionNames[actionType]} ${amount}`
      : actionNames[actionType];

    console.log(`\n  ${currentPlayer.name}: ${actionStr}`);
    console.log(`    Pot: ${stateBefore.pot} -> ${stateAfter.pot}`);
    console.log(`    Stacks: P1=${stateAfter.stackP1}, P2=${stateAfter.stackP2}`);

    // Generate Prover.toml for this action
    const toml = generateGameActionProverToml({
      stateBefore,
      stateAfter,
      player1PubKey: this.players[0].publicKey,
      player2PubKey: this.players[1].publicKey,
      actionType,
      actionAmount: amount,
    });

    const actionNum = this.gameActionCount++;
    const filename = `game_action_${actionNum}_${currentPlayer.name.replace(' ', '')}_${actionNames[actionType].toLowerCase()}.toml`;
    fs.writeFileSync(path.join(this.outputDir, filename), toml);
    console.log(`    Generated ${filename}`);

    this.gameState = stateAfter;

    return stateAfter;
  }

  gameActionCount = 0;

  // Run a sample betting sequence
  bettingPhase() {
    printDivider('BETTING: Preflop Action');

    // Preflop: SB acts first
    // Action 1: SB calls the BB
    this.executeAction(ACTION_CALL);

    // Action 2: BB checks (or raises)
    this.executeAction(ACTION_CHECK);

    // Now we're on the flop
    printDivider('BETTING: Flop Action');
    console.log(`  Street: ${this.gameState.street} (Flop)`);

    // Action 3: First player bets
    this.executeAction(ACTION_BET, 4);

    // Action 4: Second player calls
    this.executeAction(ACTION_CALL);

    // Now we're on the turn
    printDivider('BETTING: Turn Action');
    console.log(`  Street: ${this.gameState.street} (Turn)`);

    // Action 5: First player checks
    this.executeAction(ACTION_CHECK);

    // Action 6: Second player bets
    this.executeAction(ACTION_BET, 8);

    // Action 7: First player raises
    this.executeAction(ACTION_RAISE, 20);

    // Action 8: Second player calls
    this.executeAction(ACTION_CALL);

    // River
    printDivider('BETTING: River Action');
    console.log(`  Street: ${this.gameState.street} (River)`);

    // Action 9: Both check
    this.executeAction(ACTION_CHECK);
    this.executeAction(ACTION_CHECK);

    // Showdown
    printDivider('SHOWDOWN');
    console.log(`  Final pot: ${this.gameState.pot}`);
    console.log(`  Final stacks: P1=${this.gameState.stackP1}, P2=${this.gameState.stackP2}`);
  }

  // Run complete simulation
  async run() {
    console.log('\n' + '╔' + '═'.repeat(58) + '╗');
    console.log('║' + ' '.repeat(15) + 'ZK POKER E2E SIMULATION' + ' '.repeat(20) + '║');
    console.log('╚' + '═'.repeat(58) + '╝');

    // Setup
    this.setupPlayers();
    this.createDeck();

    // Shuffle phase
    this.shufflePhase();

    // Deal cards
    this.dealCards();

    // Unmask phase
    this.unmaskPhase();

    // Betting
    this.postBlinds();
    this.bettingPhase();

    // Summary
    printDivider('SIMULATION COMPLETE');
    console.log(`\n  Generated files in: ${this.outputDir}`);

    const files = fs.readdirSync(this.outputDir).filter(f => f.endsWith('.toml'));
    console.log(`  Total Prover.toml files: ${files.length}`);
    console.log('\n  Files generated:');
    files.forEach(f => console.log(`    - ${f}`));

    console.log('\n  To run proofs with sunspot:');
    console.log('    1. Copy .toml files to appropriate circuit Prover.toml locations');
    console.log('    2. Run: nargo execute --package <circuit_name>');
    console.log('    3. Run: sunspot compile/setup/prove/verify');
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  const outputDir = process.argv[2] || './e2e-output';
  const simulation = new PokerSimulation(outputDir);
  await simulation.run();
}

main().catch(console.error);
