// UI Management

const UI = {
  // Screen management
  showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(screenId);
    if (screen) screen.classList.add('active');
  },

  // Logging
  log(message, type = 'info') {
    const logContent = document.getElementById('log-content');
    if (!logContent) return;

    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;

    const time = new Date().toLocaleTimeString();
    entry.innerHTML = `<span class="time">${time}</span>${message}`;

    logContent.appendChild(entry);
    logContent.scrollTop = logContent.scrollHeight;
  },

  // Error display
  showError(elementId, message) {
    const el = document.getElementById(elementId);
    if (el) {
      el.textContent = message;
      setTimeout(() => el.textContent = '', 5000);
    }
  },

  // Player seats positioning
  getSeatPositions(numPlayers) {
    // Positions around the table (percentage from center)
    const positions = {
      2: [
        { x: 50, y: 95, betX: 50, betY: 75 },   // Bottom (me)
        { x: 50, y: 5, betX: 50, betY: 35 },    // Top (opponent)
      ],
      3: [
        { x: 50, y: 95, betX: 50, betY: 75 },
        { x: 10, y: 30, betX: 25, betY: 40 },
        { x: 90, y: 30, betX: 75, betY: 40 },
      ],
      4: [
        { x: 50, y: 95, betX: 50, betY: 75 },
        { x: 5, y: 50, betX: 20, betY: 50 },
        { x: 50, y: 5, betX: 50, betY: 35 },
        { x: 95, y: 50, betX: 80, betY: 50 },
      ],
      6: [
        { x: 50, y: 95, betX: 50, betY: 75 },
        { x: 10, y: 70, betX: 25, betY: 65 },
        { x: 10, y: 30, betX: 25, betY: 40 },
        { x: 50, y: 5, betX: 50, betY: 35 },
        { x: 90, y: 30, betX: 75, betY: 40 },
        { x: 90, y: 70, betX: 75, betY: 65 },
      ],
      10: [
        { x: 50, y: 95, betX: 50, betY: 75 },
        { x: 20, y: 90, betX: 30, betY: 72 },
        { x: 5, y: 65, betX: 18, betY: 60 },
        { x: 5, y: 35, betX: 18, betY: 40 },
        { x: 20, y: 10, betX: 30, betY: 32 },
        { x: 50, y: 5, betX: 50, betY: 35 },
        { x: 80, y: 10, betX: 70, betY: 32 },
        { x: 95, y: 35, betX: 82, betY: 40 },
        { x: 95, y: 65, betX: 82, betY: 60 },
        { x: 80, y: 90, betX: 70, betY: 72 },
      ],
    };

    // Find closest match
    const keys = Object.keys(positions).map(Number).sort((a, b) => a - b);
    let key = keys.find(k => k >= numPlayers) || keys[keys.length - 1];
    return positions[key].slice(0, numPlayers);
  },

  // Render player seats
  renderPlayerSeats() {
    const container = document.getElementById('player-seats');
    container.innerHTML = '';

    const numPlayers = gameState.players.length;
    if (numPlayers === 0) return;

    const positions = this.getSeatPositions(numPlayers);

    // Rotate positions so current player is at bottom
    let myIndex = gameState.players.findIndex(p => p.id === gameState.playerId);
    if (myIndex === -1) myIndex = 0;

    gameState.players.forEach((player, idx) => {
      // Calculate position index (rotate so player is at bottom)
      const posIdx = (idx - myIndex + numPlayers) % numPlayers;
      const pos = positions[posIdx];

      const seat = document.createElement('div');
      seat.className = 'player-seat';
      seat.id = `seat-${player.seatIndex}`;

      // Add classes based on state
      if (player.id === gameState.playerId) seat.classList.add('me');
      if (player.seatIndex === gameState.actionPos) seat.classList.add('active');
      if (player.folded) seat.classList.add('folded');

      // Position the seat
      seat.style.left = `${pos.x}%`;
      seat.style.top = `${pos.y}%`;
      seat.style.transform = 'translate(-50%, -50%)';

      // Avatar with initials
      const initials = player.name ? player.name.slice(0, 2).toUpperCase() : '??';

      seat.innerHTML = `
        <div class="player-avatar">${initials}</div>
        <div class="player-name">${player.name || 'Player'}</div>
        <div class="player-stack">${player.stack || 0}</div>
        ${!gameState.isGameInProgress() ?
          `<div class="player-status ${player.isReady ? 'ready' : ''}">${player.isReady ? 'Ready' : 'Not Ready'}</div>` :
          ''}
        <div class="player-cards" id="cards-${player.seatIndex}"></div>
      `;

      // Add bet chip if player has bet
      if (player.streetBet && player.streetBet > 0) {
        const bet = document.createElement('div');
        bet.className = 'player-bet';
        bet.textContent = player.streetBet;
        bet.style.left = `${pos.betX}%`;
        bet.style.top = `${pos.betY}%`;
        bet.style.transform = 'translate(-50%, -50%)';
        container.appendChild(bet);
      }

      container.appendChild(seat);
    });

    // Position dealer button
    this.positionDealerButton();
  },

  // Position dealer button near dealer
  positionDealerButton() {
    const dealerBtn = document.getElementById('dealer-button');
    const dealer = gameState.getPlayerBySeat(gameState.buttonPos);
    if (!dealer) {
      dealerBtn.style.display = 'none';
      return;
    }

    dealerBtn.style.display = 'flex';

    // Find dealer's seat element
    const seatEl = document.getElementById(`seat-${dealer.seatIndex}`);
    if (seatEl) {
      const rect = seatEl.getBoundingClientRect();
      const tableRect = document.querySelector('.poker-table').getBoundingClientRect();

      // Position relative to table
      const x = ((rect.left + rect.width / 2 - tableRect.left) / tableRect.width) * 100 + 8;
      const y = ((rect.top - tableRect.top) / tableRect.height) * 100;

      dealerBtn.style.left = `${x}%`;
      dealerBtn.style.top = `${y}%`;
    }
  },

  // Render community cards
  renderCommunityCards() {
    const container = document.getElementById('community-cards');
    container.innerHTML = '';

    // Always show 5 slots
    for (let i = 0; i < 5; i++) {
      let card;
      if (i < gameState.communityCards.length) {
        card = createCardElement(gameState.communityCards[i]);
        card.classList.add('dealing');
      } else {
        card = createPlaceholderCard();
      }
      container.appendChild(card);
    }
  },

  // Render my hole cards
  renderMyCards() {
    const container = document.getElementById('my-cards');
    container.innerHTML = '';

    for (let i = 0; i < 2; i++) {
      let card;
      if (i < gameState.myCards.length && gameState.myCards[i] !== null) {
        card = createCardElement(gameState.myCards[i]);
      } else if (gameState.myCardIndices.length > 0) {
        // Cards dealt but not yet revealed
        card = createCardElement(null, { faceDown: true });
      } else {
        card = createCardElement(null, { faceDown: true });
      }
      container.appendChild(card);
    }
  },

  // Update pot display
  updatePot() {
    document.getElementById('pot-amount').textContent = gameState.pot;
  },

  // Update action panel
  updateActionPanel() {
    const statusEl = document.getElementById('action-status');
    const actionButtons = document.getElementById('action-buttons');
    const readyControls = document.getElementById('ready-controls');
    const betControls = document.getElementById('bet-controls');

    // Hide bet controls by default
    betControls.classList.remove('active');

    if (!gameState.isGameInProgress()) {
      // Waiting phase - show ready buttons
      readyControls.classList.remove('hidden');
      actionButtons.style.display = 'none';

      const waitingCount = gameState.players.filter(p => !p.isReady).length;
      if (waitingCount > 0) {
        statusEl.textContent = `Waiting for ${waitingCount} player(s) to ready up...`;
      } else {
        statusEl.textContent = 'All players ready! Starting game...';
      }

      // Update ready button states
      document.getElementById('ready-btn').disabled = gameState.isReady;
      document.getElementById('not-ready-btn').disabled = !gameState.isReady;
      return;
    }

    // Game in progress - hide ready controls
    readyControls.classList.add('hidden');
    actionButtons.style.display = 'flex';

    if (gameState.status === GameStatus.SHUFFLE) {
      statusEl.textContent = 'Shuffling deck...';
      this.disableAllActions();
      return;
    }

    if (gameState.status === GameStatus.DEALING) {
      statusEl.textContent = 'Dealing cards...';
      this.disableAllActions();
      return;
    }

    if (gameState.status === GameStatus.SHOWDOWN) {
      statusEl.textContent = 'Showdown!';
      this.disableAllActions();
      return;
    }

    if (gameState.isMyTurn) {
      const currentPlayer = gameState.getPlayerBySeat(gameState.actionPos);
      statusEl.textContent = 'Your turn!';
      statusEl.style.color = 'var(--accent)';
      this.enableActions();
    } else {
      const currentPlayer = gameState.getPlayerBySeat(gameState.actionPos);
      statusEl.textContent = currentPlayer ?
        `${currentPlayer.name}'s turn...` :
        'Waiting...';
      statusEl.style.color = '';
      this.disableAllActions();
    }
  },

  // Enable action buttons based on valid actions
  enableActions() {
    const validActions = gameState.validActions || [];
    const amountToCall = gameState.calculateAmountToCall();

    // Fold - always available
    document.querySelector('.btn-fold').disabled = !validActions.includes(ActionType.FOLD);

    // Check
    document.querySelector('.btn-check').disabled = !validActions.includes(ActionType.CHECK);

    // Call
    const callBtn = document.querySelector('.btn-call');
    callBtn.disabled = !validActions.includes(ActionType.CALL);
    callBtn.querySelector('.call-amount').textContent = amountToCall > 0 ? amountToCall : '';

    // Raise
    document.querySelector('.btn-raise').disabled =
      !validActions.includes(ActionType.RAISE) && !validActions.includes(ActionType.BET);

    // All In
    document.querySelector('.btn-allin').disabled = !validActions.includes(ActionType.ALL_IN);
  },

  // Disable all action buttons
  disableAllActions() {
    document.querySelectorAll('.action-buttons .btn').forEach(btn => {
      btn.disabled = true;
    });
  },

  // Show bet/raise controls
  showBetControls() {
    const betControls = document.getElementById('bet-controls');
    const slider = document.getElementById('bet-slider');
    const amountInput = document.getElementById('bet-amount');

    const me = gameState.getMe();
    if (!me) return;

    const minAmount = gameState.minRaise || gameState.minBet || 2;
    const maxAmount = me.stack;

    slider.min = minAmount;
    slider.max = maxAmount;
    slider.value = minAmount;

    amountInput.min = minAmount;
    amountInput.max = maxAmount;
    amountInput.value = minAmount;

    betControls.classList.add('active');
  },

  // Hide bet controls
  hideBetControls() {
    document.getElementById('bet-controls').classList.remove('active');
  },

  // Update turn timer
  updateTimer() {
    const timerEl = document.getElementById('turn-timer');

    if (!gameState.isMyTurn || !gameState.turnStartTime) {
      timerEl.textContent = '';
      return;
    }

    const elapsed = Date.now() - gameState.turnStartTime;
    const remaining = Math.max(0, gameState.turnTimeoutMs - elapsed);
    const seconds = Math.ceil(remaining / 1000);

    timerEl.textContent = `${seconds}s`;

    if (seconds <= 10) {
      timerEl.style.color = 'var(--danger)';
    } else {
      timerEl.style.color = '';
    }
  },

  // Show showdown modal
  showShowdown(data) {
    const modal = document.getElementById('showdown-modal');
    const results = document.getElementById('showdown-results');

    results.innerHTML = '';

    for (const player of data.players || []) {
      const isWinner = (data.winners || []).includes(player.id);
      const winnings = (data.potDistribution || []).find(p => p.playerId === player.id);

      const playerData = gameState.getPlayer(player.id);
      const div = document.createElement('div');
      div.className = `showdown-player ${isWinner ? 'winner' : ''}`;

      div.innerHTML = `
        <div class="name">${playerData?.name || 'Player'}</div>
        <div class="hand">${player.handDescription || 'Unknown hand'}</div>
        ${isWinner && winnings ? `<div class="winnings">Won ${winnings.amount} chips!</div>` : ''}
      `;

      results.appendChild(div);
    }

    modal.classList.add('active');
  },

  // Hide showdown modal
  hideShowdown() {
    document.getElementById('showdown-modal').classList.remove('active');
  },

  // Full UI refresh
  refresh() {
    this.renderPlayerSeats();
    this.renderCommunityCards();
    this.renderMyCards();
    this.updatePot();
    this.updateActionPanel();
  }
};

// Timer interval
setInterval(() => UI.updateTimer(), 100);
