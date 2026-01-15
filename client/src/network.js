// WebSocket client for multiplayer ZK Poker

export class GameClient {
  constructor(serverUrl = 'ws://localhost:8080') {
    this.serverUrl = serverUrl;
    this.ws = null;
    this.playerId = null;
    this.roomId = null;
    this.listeners = new Map();
  }

  // Connect to server
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.serverUrl);

      this.ws.onopen = () => {
        console.log('[Network] Connected to server');
        resolve();
      };

      this.ws.onerror = (err) => {
        console.error('[Network] Connection error:', err);
        reject(err);
      };

      this.ws.onclose = () => {
        console.log('[Network] Disconnected from server');
        this.emit('disconnected');
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleMessage(msg);
        } catch (err) {
          console.error('[Network] Failed to parse message:', err);
        }
      };
    });
  }

  // Disconnect
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // Send message to server
  send(type, data = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[Network] Not connected');
      return;
    }
    const msg = { type, ...data };
    this.ws.send(JSON.stringify(msg));
  }

  // Handle incoming messages
  handleMessage(msg) {
    console.log('[Network] Received:', msg.type, msg);

    switch (msg.type) {
      case 'connected':
        this.playerId = msg.playerId;
        console.log('[Network] Assigned player ID:', this.playerId);
        break;

      case 'room_joined':
        this.playerId = msg.playerId;
        this.roomId = msg.roomId;
        this.emit('room_joined', msg);
        break;

      case 'player_joined':
        this.emit('player_joined', msg);
        break;

      case 'player_left':
        this.emit('player_left', msg);
        break;

      case 'player_ready':
        this.emit('player_ready', msg);
        break;

      case 'game_started':
        this.emit('game_started', msg);
        break;

      case 'shuffle_turn':
        this.emit('shuffle_turn', msg);
        break;

      case 'shuffle_complete':
        this.emit('shuffle_complete', msg);
        break;

      case 'cards_dealt':
        this.emit('cards_dealt', msg);
        break;

      case 'unmask_request':
        this.emit('unmask_request', msg);
        break;

      case 'card_partially_unmasked':
        this.emit('card_partially_unmasked', msg);
        break;

      case 'card_fully_unmasked':
        this.emit('card_fully_unmasked', msg);
        break;

      case 'player_turn':
        this.emit('player_turn', msg);
        break;

      case 'action_result':
        this.emit('action_result', msg);
        break;

      case 'street_advanced':
        this.emit('street_advanced', msg);
        break;

      case 'reveal_hand_request':
        this.emit('reveal_hand_request', msg);
        break;

      case 'hand_revealed':
        this.emit('hand_revealed', msg);
        break;

      case 'showdown':
        this.emit('showdown', msg);
        break;

      case 'player_forfeited':
        this.emit('player_forfeited', msg);
        break;

      case 'fold_winner':
        this.emit('fold_winner', msg);
        break;

      case 'game_ended':
        this.emit('game_ended', msg);
        break;

      case 'error':
        console.error('[Network] Server error:', msg.message);
        this.emit('error', msg);
        break;

      default:
        console.log('[Network] Unknown message type:', msg.type);
    }
  }

  // Event emitter
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const callbacks = this.listeners.get(event);
    const idx = callbacks.indexOf(callback);
    if (idx !== -1) callbacks.splice(idx, 1);
  }

  emit(event, data) {
    if (!this.listeners.has(event)) return;
    for (const callback of this.listeners.get(event)) {
      callback(data);
    }
  }

  // === Game Actions ===

  // Join or create a room
  joinRoom(roomId, playerName, publicKey) {
    const msg = {
      playerName: playerName || 'Player',
      publicKeyX: publicKey[0].toString(),
      publicKeyY: publicKey[1].toString()
    };
    if (roomId) {
      msg.roomId = roomId;
    }
    this.send('join_room', msg);
  }

  // Leave room
  leaveRoom() {
    this.send('leave_room');
  }

  // Signal ready
  ready() {
    this.send('ready', { isReady: true });
  }

  // Submit shuffled deck with proof
  submitShuffle(shuffledDeck, deckCommitment, proof) {
    // Convert BigInts to strings for JSON serialization
    const serializedDeck = shuffledDeck.map(card => ({
      epkX: card.epk[0].toString(),
      epkY: card.epk[1].toString(),
      msgX: card.msg[0].toString(),
      msgY: card.msg[1].toString(),
      pkX: card.pk[0].toString(),
      pkY: card.pk[1].toString()
    }));

    this.send('submit_shuffle', {
      shuffledDeck: serializedDeck,
      deckCommitment: deckCommitment.toString(),
      proof: proof.proof,
      publicWitness: proof.publicSignals
    });
  }

  // Submit betting action with proof
  submitAction(actionType, amount, stateCommitment, proof) {
    this.send('submit_action', {
      actionType,
      amount,
      stateCommitment: stateCommitment.toString(),
      proof: proof?.proof,
      publicWitness: proof?.publicSignals
    });
  }

  // Submit card unmask with proof
  submitUnmask(cardIndex, unmaskedCard, proof) {
    // Convert BigInts to strings for JSON serialization
    const serializedCard = {
      epkX: unmaskedCard.epk[0].toString(),
      epkY: unmaskedCard.epk[1].toString(),
      msgX: unmaskedCard.msg[0].toString(),
      msgY: unmaskedCard.msg[1].toString(),
      pkX: unmaskedCard.pk[0].toString(),
      pkY: unmaskedCard.pk[1].toString()
    };

    this.send('submit_unmask', {
      cardIndex,
      unmaskedCard: serializedCard,
      proof: proof.proof,
      publicWitness: proof.publicSignals
    });
  }

  // Submit hand reveal with proof
  submitHandReveal(handRank, handDescription, cardIndices, proof) {
    this.send('submit_hand_reveal', {
      handRank,
      handDescription,
      cardIndices,
      proof: proof?.proof,
      publicWitness: proof?.publicSignals
    });
  }
}

export const gameClient = new GameClient();
