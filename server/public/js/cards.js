// Card rendering utilities

const SUITS = {
  0: { symbol: '\u2660', name: 'spades', color: 'black' },   // Spades
  1: { symbol: '\u2665', name: 'hearts', color: 'red' },     // Hearts
  2: { symbol: '\u2666', name: 'diamonds', color: 'red' },   // Diamonds
  3: { symbol: '\u2663', name: 'clubs', color: 'black' },    // Clubs
};

const RANKS = {
  0: '2', 1: '3', 2: '4', 3: '5', 4: '6', 5: '7', 6: '8',
  7: '9', 8: '10', 9: 'J', 10: 'Q', 11: 'K', 12: 'A'
};

/**
 * Convert card index (0-51) to rank and suit
 * Cards are ordered: 2s, 3s, 4s, ... As, 2h, 3h, ... Ah, 2d, ... Ac
 */
function cardIndexToRankSuit(cardIndex) {
  const rank = cardIndex % 13;
  const suit = Math.floor(cardIndex / 13);
  return { rank, suit };
}

/**
 * Create a card DOM element
 */
function createCardElement(cardIndex, options = {}) {
  const { small = false, faceDown = false } = options;

  const card = document.createElement('div');
  card.className = 'card';

  if (small) {
    card.classList.add('small');
  }

  if (faceDown || cardIndex === null || cardIndex === undefined) {
    card.classList.add('card-back');
    return card;
  }

  const { rank, suit } = cardIndexToRankSuit(cardIndex);
  const suitInfo = SUITS[suit];
  const rankStr = RANKS[rank];

  card.classList.add(suitInfo.color);

  card.innerHTML = `
    <div class="rank">${rankStr}</div>
    <div class="suit">${suitInfo.symbol}</div>
    <div class="rank-bottom">${rankStr}</div>
  `;

  return card;
}

/**
 * Create a placeholder card element
 */
function createPlaceholderCard() {
  const card = document.createElement('div');
  card.className = 'card card-placeholder';
  return card;
}

/**
 * Get card name string
 */
function getCardName(cardIndex) {
  if (cardIndex === null || cardIndex === undefined) {
    return 'Unknown';
  }
  const { rank, suit } = cardIndexToRankSuit(cardIndex);
  const rankNames = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King', 'Ace'];
  const suitNames = ['Spades', 'Hearts', 'Diamonds', 'Clubs'];
  return `${rankNames[rank]} of ${suitNames[suit]}`;
}

/**
 * Create a mini card for opponent display
 */
function createMiniCard(cardIndex, faceDown = true) {
  const card = document.createElement('div');
  card.className = 'card';
  card.style.width = '30px';
  card.style.height = '42px';

  if (faceDown || cardIndex === null) {
    card.classList.add('card-back');
    return card;
  }

  const { rank, suit } = cardIndexToRankSuit(cardIndex);
  const suitInfo = SUITS[suit];
  const rankStr = RANKS[rank];

  card.classList.add(suitInfo.color);
  card.style.fontSize = '0.6rem';
  card.innerHTML = `<div style="text-align:center;padding-top:5px;">${rankStr}${suitInfo.symbol}</div>`;

  return card;
}
