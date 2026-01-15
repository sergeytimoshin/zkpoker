// Main Application - WebSocket Communication & Event Handling

// Generate random hex string for keys (placeholder)
function randomHex(length = 16) {
  return '0x' + Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// WebSocket connection
function connect() {
  const serverUrl = document.getElementById('server-url').value;
  const playerName = document.getElementById('player-name').value.trim();

  if (!playerName) {
    UI.showError('connect-error', 'Please enter your name');
    return;
  }

  gameState.playerName = playerName;

  UI.log(`Connecting to ${serverUrl}...`, 'info');

  try {
    gameState.ws = new WebSocket(serverUrl);

    gameState.ws.onopen = () => {
      UI.log('Connected!', 'action');
      gameState.connected = true;
    };

    gameState.ws.onclose = () => {
      UI.log('Disconnected', 'info');
      gameState.reset();
      UI.showScreen('connect-screen');
    };

    gameState.ws.onerror = (error) => {
      UI.showError('connect-error', 'Connection failed');
      UI.log('Connection error', 'error');
    };

    gameState.ws.onmessage = (event) => {
      handleMessage(JSON.parse(event.data));
    };

  } catch (error) {
    UI.showError('connect-error', 'Invalid server URL');
  }
}

function disconnect() {
  if (gameState.ws) {
    gameState.ws.close();
  }
}

function send(message) {
  if (gameState.ws && gameState.ws.readyState === WebSocket.OPEN) {
    gameState.ws.send(JSON.stringify(message));
  }
}

// Message handlers
function handleMessage(data) {
  console.log('Received:', data);

  switch (data.type) {
    case 'connected':
      handleConnected(data);
      break;
    case 'room_joined':
      handleRoomJoined(data);
      break;
    case 'player_joined':
      handlePlayerJoined(data);
      break;
    case 'player_left':
      handlePlayerLeft(data);
      break;
    case 'player_ready':
      handlePlayerReady(data);
      break;
    case 'game_started':
      handleGameStarted(data);
      break;
    case 'shuffle_turn':
      handleShuffleTurn(data);
      break;
    case 'shuffle_complete':
      handleShuffleComplete(data);
      break;
    case 'cards_dealt':
      handleCardsDealt(data);
      break;
    case 'unmask_request':
      handleUnmaskRequest(data);
      break;
    case 'card_partially_unmasked':
      handleCardPartiallyUnmasked(data);
      break;
    case 'card_fully_unmasked':
      handleCardFullyUnmasked(data);
      break;
    case 'player_turn':
      handlePlayerTurn(data);
      break;
    case 'action_result':
      handleActionResult(data);
      break;
    case 'street_advanced':
      handleStreetAdvanced(data);
      break;
    case 'showdown':
      handleShowdown(data);
      break;
    case 'game_ended':
      handleGameEnded(data);
      break;
    case 'error':
      handleError(data);
      break;
    default:
      console.log('Unknown message type:', data.type);
  }
}

function handleConnected(data) {
  gameState.playerId = data.playerId;
  document.getElementById('player-info').textContent = `ID: ${data.playerId.slice(0, 8)}...`;
  UI.showScreen('lobby-screen');
}

function handleRoomJoined(data) {
  gameState.roomId = data.roomId;
  gameState.mySeatIndex = data.seatIndex;
  gameState.config = data.config;

  // Initialize players
  gameState.players = data.players.map(p => ({
    ...p,
    stack: gameState.config?.startingStack || 100,
    streetBet: 0,
    folded: false,
    allIn: false,
  }));

  document.getElementById('room-id-display').textContent = `Room: ${data.roomId}`;

  UI.showScreen('game-screen');
  UI.log(`Joined room ${data.roomId.slice(0, 8)}...`, 'action');
  UI.refresh();
}

function handlePlayerJoined(data) {
  gameState.players.push({
    id: data.playerId,
    name: data.playerName,
    seatIndex: data.seatIndex,
    isReady: false,
    stack: gameState.config?.startingStack || 100,
    streetBet: 0,
    folded: false,
    allIn: false,
  });

  UI.log(`${data.playerName} joined`, 'info');
  UI.refresh();
}

function handlePlayerLeft(data) {
  const player = gameState.getPlayer(data.playerId);
  const name = player?.name || 'Player';

  gameState.players = gameState.players.filter(p => p.id !== data.playerId);

  UI.log(`${name} left`, 'info');
  UI.refresh();
}

function handlePlayerReady(data) {
  const player = gameState.getPlayer(data.playerId);
  if (player) {
    player.isReady = data.isReady;
    if (player.id === gameState.playerId) {
      gameState.isReady = data.isReady;
    }
  }

  UI.log(`${player?.name || 'Player'} is ${data.isReady ? 'ready' : 'not ready'}`, 'info');
  UI.refresh();
}

function handleGameStarted(data) {
  UI.log('Game started!', 'action');

  if (data.gameState) {
    gameState.updateFromGameState(data.gameState);
    gameState.status = data.gameState.status || GameStatus.SHUFFLE;
  }

  // Reset game state
  gameState.communityCards = [];
  gameState.myCards = [];
  gameState.myCardIndices = [];

  UI.refresh();
}

function handleShuffleTurn(data) {
  gameState.status = GameStatus.SHUFFLE;

  const player = gameState.getPlayer(data.playerId);
  UI.log(`${player?.name || 'Player'}'s turn to shuffle`, 'info');

  // If it's our turn to shuffle, auto-submit (simplified - no actual crypto)
  if (data.playerId === gameState.playerId) {
    UI.log('Submitting shuffle...', 'info');

    // For demo, submit a mock shuffle (no real encryption)
    // In production, this would use the SDK to generate real encrypted deck
    setTimeout(() => {
      const mockDeck = [];
      for (let i = 0; i < 52; i++) {
        mockDeck.push({
          epkX: randomHex(32),
          epkY: randomHex(32),
          msgX: randomHex(32),
          msgY: randomHex(32),
          pkX: randomHex(32),
          pkY: randomHex(32),
        });
      }

      send({
        type: 'submit_shuffle',
        shuffledDeck: mockDeck,
        deckCommitment: randomHex(32),
        // proof and publicWitness would be real ZK proofs in production
      });
    }, 500);
  }

  UI.refresh();
}

function handleShuffleComplete(data) {
  const player = gameState.getPlayer(data.playerId);
  UI.log(`${player?.name || 'Player'} completed shuffle`, 'info');
}

function handleCardsDealt(data) {
  gameState.status = GameStatus.DEALING;
  gameState.myCardIndices = data.yourCards || [];

  UI.log(`Received ${data.yourCards?.length || 0} cards`, 'info');
  UI.refresh();
}

function handleUnmaskRequest(data) {
  // Auto-submit unmask (simplified)
  UI.log(`Unmasking card ${data.cardIndex} for ${data.forPlayerId.slice(0, 8)}...`, 'info');

  setTimeout(() => {
    send({
      type: 'submit_unmask',
      cardIndex: data.cardIndex,
      unmaskedCard: {
        epkX: randomHex(32),
        epkY: randomHex(32),
        msgX: randomHex(32),
        msgY: randomHex(32),
        pkX: '0',
        pkY: '0',
      },
    });
  }, 100);
}

function handleCardPartiallyUnmasked(data) {
  UI.log(`Card ${data.cardIndex} partially unmasked (${data.remainingUnmasks} remaining)`, 'info');
}

function handleCardFullyUnmasked(data) {
  // For demo, simulate card reveal using card index
  // In production, would decrypt the actual card point
  const cardIndex = data.cardIndex;

  // Find which of my cards this is
  const myCardPosition = gameState.myCardIndices.indexOf(cardIndex);
  if (myCardPosition !== -1) {
    // Simulate a card value (in reality, decrypt from card point)
    const simulatedCardValue = cardIndex % 52;
    gameState.myCards[myCardPosition] = simulatedCardValue;

    UI.log(`Your card revealed: ${getCardName(simulatedCardValue)}`, 'action');
    UI.renderMyCards();
  }
}

function handlePlayerTurn(data) {
  gameState.status = GameStatus.BETTING;
  gameState.actionPos = data.seatIndex;
  gameState.validActions = data.validActions || [];
  gameState.minBet = data.minBet || 2;
  gameState.minRaise = data.minRaise || 2;
  gameState.turnTimeoutMs = data.timeoutMs || 60000;

  const isMe = data.playerId === gameState.playerId;
  gameState.isMyTurn = isMe;

  if (isMe) {
    gameState.turnStartTime = Date.now();
    UI.log('Your turn!', 'action');
  } else {
    gameState.turnStartTime = null;
    const player = gameState.getPlayer(data.playerId);
    UI.log(`${player?.name || 'Player'}'s turn`, 'info');
  }

  UI.refresh();
}

function handleActionResult(data) {
  const player = gameState.getPlayer(data.playerId);
  if (player) {
    player.stack = data.playerStack;

    // Update streetBet based on action
    if (data.actionType === ActionType.CALL || data.actionType === ActionType.BET ||
        data.actionType === ActionType.RAISE || data.actionType === ActionType.ALL_IN) {
      player.streetBet = (player.streetBet || 0) + data.amount;
    }

    if (data.actionType === ActionType.FOLD) {
      player.folded = true;
    }

    if (data.actionType === ActionType.ALL_IN) {
      player.allIn = true;
    }
  }

  gameState.pot = data.newPot;
  gameState.isMyTurn = false;

  UI.log(`${player?.name || 'Player'}: ${ActionNames[data.actionType]}${data.amount > 0 ? ' ' + data.amount : ''}`, 'action');
  UI.hideBetControls();
  UI.refresh();
}

function handleStreetAdvanced(data) {
  gameState.street = data.street;

  // Reset street bets
  gameState.players.forEach(p => p.streetBet = 0);

  // Add community cards (simulated indices for demo)
  if (data.communityCardIndices) {
    gameState.communityCards = data.communityCardIndices.map(idx => idx % 52);
  }

  UI.log(`${StreetNames[data.street]}`, 'action');
  UI.refresh();
}

function handleShowdown(data) {
  gameState.status = GameStatus.SHOWDOWN;
  UI.log('Showdown!', 'action');
  UI.showShowdown(data);
  UI.refresh();
}

function handleGameEnded(data) {
  gameState.status = GameStatus.FINISHED;

  // Update final stacks
  if (data.finalStacks) {
    data.finalStacks.forEach(fs => {
      const player = gameState.getPlayer(fs.playerId);
      if (player) player.stack = fs.stack;
    });
  }

  UI.log(`Game ended: ${data.reason}`, 'info');

  // Reset for next hand
  setTimeout(() => {
    gameState.players.forEach(p => {
      p.isReady = false;
      p.streetBet = 0;
      p.folded = false;
      p.allIn = false;
    });
    gameState.isReady = false;
    gameState.communityCards = [];
    gameState.myCards = [];
    gameState.myCardIndices = [];
    gameState.pot = 0;
    gameState.status = GameStatus.WAITING;

    UI.hideShowdown();
    UI.refresh();
  }, 3000);
}

function handleError(data) {
  UI.log(`Error: ${data.message}`, 'error');
}

// Room actions
function createRoom() {
  send({
    type: 'join_room',
    playerName: gameState.playerName,
    publicKeyX: randomHex(32),
    publicKeyY: randomHex(32),
  });
}

function joinRoom() {
  const roomId = document.getElementById('room-id-input').value.trim();
  if (!roomId) {
    alert('Please enter a room ID');
    return;
  }

  send({
    type: 'join_room',
    roomId: roomId,
    playerName: gameState.playerName,
    publicKeyX: randomHex(32),
    publicKeyY: randomHex(32),
  });
}

function leaveRoom() {
  send({ type: 'leave_room' });
  gameState.roomId = null;
  UI.showScreen('lobby-screen');
}

function setReady(ready) {
  send({ type: 'ready', isReady: ready });
}

// Game actions
function doAction(actionType) {
  if (!gameState.isMyTurn) return;

  if (actionType === 'raise' || actionType === 'bet') {
    UI.showBetControls();
    return;
  }

  const actionMap = {
    'fold': ActionType.FOLD,
    'check': ActionType.CHECK,
    'call': ActionType.CALL,
    'all_in': ActionType.ALL_IN,
  };

  send({
    type: 'submit_action',
    actionType: actionMap[actionType],
    amount: actionType === 'call' ? gameState.calculateAmountToCall() : 0,
  });
}

function confirmBet() {
  const amount = parseInt(document.getElementById('bet-amount').value) || 0;

  // Determine if this is a bet or raise
  const maxStreetBet = Math.max(...gameState.players.map(p => p.streetBet || 0));
  const actionType = maxStreetBet === 0 ? ActionType.BET : ActionType.RAISE;

  send({
    type: 'submit_action',
    actionType: actionType,
    amount: amount,
  });

  UI.hideBetControls();
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  // Connect screen
  document.getElementById('connect-btn').addEventListener('click', connect);
  document.getElementById('player-name').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') connect();
  });

  // Lobby screen
  document.getElementById('create-room-btn').addEventListener('click', createRoom);
  document.getElementById('join-room-btn').addEventListener('click', joinRoom);
  document.getElementById('disconnect-btn').addEventListener('click', disconnect);
  document.getElementById('room-id-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinRoom();
  });

  // Game screen
  document.getElementById('leave-room-btn').addEventListener('click', leaveRoom);
  document.getElementById('copy-room-id').addEventListener('click', () => {
    navigator.clipboard.writeText(gameState.roomId || '');
    document.getElementById('copy-room-id').textContent = 'Copied!';
    setTimeout(() => {
      document.getElementById('copy-room-id').textContent = 'Copy';
    }, 2000);
  });

  // Ready controls
  document.getElementById('ready-btn').addEventListener('click', () => setReady(true));
  document.getElementById('not-ready-btn').addEventListener('click', () => setReady(false));

  // Action buttons
  document.querySelectorAll('.action-buttons .btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action) doAction(action);
    });
  });

  // Bet controls
  document.getElementById('bet-slider').addEventListener('input', (e) => {
    document.getElementById('bet-amount').value = e.target.value;
  });

  document.getElementById('bet-amount').addEventListener('input', (e) => {
    document.getElementById('bet-slider').value = e.target.value;
  });

  document.getElementById('confirm-bet').addEventListener('click', confirmBet);

  // Bet presets
  document.querySelectorAll('.btn-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset;
      const me = gameState.getMe();
      if (!me) return;

      let amount = gameState.minBet;
      switch (preset) {
        case 'min':
          amount = gameState.minRaise || gameState.minBet;
          break;
        case 'half':
          amount = Math.floor(gameState.pot / 2);
          break;
        case 'pot':
          amount = gameState.pot;
          break;
        case 'allin':
          amount = me.stack;
          break;
      }

      amount = Math.max(amount, gameState.minRaise || gameState.minBet);
      amount = Math.min(amount, me.stack);

      document.getElementById('bet-amount').value = amount;
      document.getElementById('bet-slider').value = amount;
    });
  });

  // Showdown modal
  document.getElementById('close-showdown').addEventListener('click', () => {
    UI.hideShowdown();
  });

  // Random player name
  const adjectives = ['Lucky', 'Swift', 'Bold', 'Clever', 'Wise'];
  const nouns = ['Ace', 'King', 'Queen', 'Jack', 'Joker'];
  const randomName = adjectives[Math.floor(Math.random() * adjectives.length)] +
                     nouns[Math.floor(Math.random() * nouns.length)] +
                     Math.floor(Math.random() * 100);
  document.getElementById('player-name').value = randomName;
});
