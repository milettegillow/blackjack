(() => {
  const MODE_NAMES = {
    1: 'Learn to Play',
    2: 'Learn to Count',
    3: 'Test Yourself',
  };

  const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const SUITS = ['C','D','H','S'];
  const NUM_DECKS = 6;
  const RESHUFFLE_THRESHOLD = 0.25;

  let shoe = [];
  let initialShoeSize = 0;
  let dealerHand = [];
  let playerHand = [];

  const home = document.getElementById('screen-home');
  const game = document.getElementById('gameScreen');
  const topMode = document.getElementById('topMode');
  const backBtn = document.getElementById('backBtn');
  const countPanel = document.getElementById('countPanel');
  const deckIndicator = document.getElementById('deckIndicator');
  const moneyRow = document.getElementById('moneyRow');
  const chipRackM2 = document.getElementById('chipRackM2');
  const chipRackM3 = document.getElementById('chipRackM3');
  const dealerHandEl = document.getElementById('dealerHand');
  const playerHandEl = document.getElementById('playerHand');
  const dealerScoreEl = document.getElementById('dealerScore');
  const playerScoreEl = document.getElementById('playerScore');
  const dealBtn = document.getElementById('dealBtn');
  const hitBtn = document.getElementById('hitBtn');

  // ---------- shoe ----------
  function buildShoe(numDecks = NUM_DECKS) {
    const cards = [];
    for (let d = 0; d < numDecks; d++)
      for (const s of SUITS)
        for (const r of RANKS)
          cards.push({ rank: r, suit: s });
    return shuffle(cards);
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function drawCard() {
    if (shoe.length / initialShoeSize < RESHUFFLE_THRESHOLD) {
      shoe = buildShoe();
      initialShoeSize = shoe.length;
    }
    return shoe.pop();
  }

  // ---------- rendering ----------
  function cardSvgPath(card) {
    return `assets/cards/${card.rank}${card.suit}.svg`;
  }

  function renderCard(card, faceDown = false) {
    const el = document.createElement('div');
    el.className = 'card' + (faceDown ? ' flipped' : '');
    el.dataset.rank = card.rank;
    el.dataset.suit = card.suit;
    el.innerHTML = `
      <div class="card-inner">
        <div class="card-face card-front">
          <img src="${cardSvgPath(card)}" alt="${card.rank}${card.suit}">
        </div>
        <div class="card-face card-back">
          <img src="assets/cards/back.svg" alt="">
        </div>
      </div>
    `;
    return el;
  }

  function layoutHand(handZone) {
    const cards = Array.from(handZone.querySelectorAll('.card'));
    const n = cards.length;
    if (n === 0) return;
    const cardWidth = 70;
    const overlap = n > 4 ? 28 : 36;
    const totalWidth = (n - 1) * overlap + cardWidth;
    const startX = -totalWidth / 2;
    cards.forEach((card, i) => {
      const x = startX + i * overlap;
      const rot = (i - (n - 1) / 2) * 3;
      card.style.left = `calc(50% + ${x}px)`;
      card.style.top = '0';
      card.style.setProperty('--rot', `${rot}deg`);
    });
  }

  // ---------- evaluation ----------
  function rankValue(r) {
    if (r === 'A') return 11;
    if (['J','Q','K'].includes(r)) return 10;
    return parseInt(r, 10);
  }

  function evaluateHand(cards) {
    let total = 0, aces = 0;
    for (const c of cards) {
      total += rankValue(c.rank);
      if (c.rank === 'A') aces++;
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return {
      total,
      soft: aces > 0,
      isBlackjack: cards.length === 2 && total === 21,
      isBust: total > 21,
    };
  }

  function updateScores() {
    if (playerHand.length === 0) {
      playerScoreEl.textContent = '';
      playerScoreEl.className = 'hand-score';
    } else {
      const ev = evaluateHand(playerHand);
      playerScoreEl.textContent = ev.total;
      playerScoreEl.className = 'hand-score';
      if (ev.isBlackjack) playerScoreEl.classList.add('blackjack');
      else if (ev.isBust) playerScoreEl.classList.add('bust');
    }

    if (dealerHand.length === 0) {
      dealerScoreEl.textContent = '';
    } else {
      dealerScoreEl.textContent = rankValue(dealerHand[0].rank);
    }
  }

  function updateDeckCount() {
    const el = document.getElementById('deckCount');
    if (el) el.textContent = `${shoe.length} / ${initialShoeSize}`;
  }

  // ---------- deal ----------
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function dealCardTo(handZone, card, faceDown = false) {
    const el = renderCard(card, faceDown);
    el.classList.add('dealing');
    handZone.appendChild(el);
    layoutHand(handZone);
    await sleep(520);
    el.classList.remove('dealing');
  }

  async function dealNewHand() {
    dealerHandEl.innerHTML = '';
    playerHandEl.innerHTML = '';
    dealerHand = [];
    playerHand = [];
    updateScores();

    dealBtn.disabled = true;
    hitBtn.disabled = true;

    const c1 = drawCard(); playerHand.push(c1);
    await dealCardTo(playerHandEl, c1);

    const c2 = drawCard(); dealerHand.push(c2);
    await dealCardTo(dealerHandEl, c2);

    const c3 = drawCard(); playerHand.push(c3);
    await dealCardTo(playerHandEl, c3);

    const c4 = drawCard(); dealerHand.push(c4);
    await dealCardTo(dealerHandEl, c4, true);

    updateScores();
    updateDeckCount();
    dealBtn.disabled = false;
    hitBtn.disabled = false;
  }

  function resetGameState() {
    shoe = buildShoe();
    initialShoeSize = shoe.length;
    dealerHand = [];
    playerHand = [];
    dealerHandEl.innerHTML = '';
    playerHandEl.innerHTML = '';
    updateScores();
    updateDeckCount();
    hitBtn.disabled = true;
  }

  // ---------- screen routing ----------
  function showHome() {
    resetGameState();
    home.classList.remove('hidden');
    game.classList.add('hidden');
    countPanel.classList.add('hidden');
    deckIndicator.classList.add('hidden');
    moneyRow.classList.add('hidden');
    chipRackM2.classList.add('hidden');
    chipRackM3.classList.add('hidden');
  }

  function showGame(mode) {
    resetGameState();
    topMode.textContent = MODE_NAMES[mode] || '';
    countPanel.classList.toggle('hidden', mode !== 2);
    deckIndicator.classList.toggle('hidden', mode === 1);
    moneyRow.classList.toggle('hidden', mode !== 3);
    chipRackM2.classList.toggle('hidden', mode !== 2);
    chipRackM3.classList.toggle('hidden', mode !== 3);
    home.classList.add('hidden');
    game.classList.remove('hidden');
  }

  // ---------- wiring ----------
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => showGame(Number(btn.dataset.mode)));
  });

  backBtn.addEventListener('click', showHome);

  dealBtn.addEventListener('click', dealNewHand);

  hitBtn.addEventListener('click', async () => {
    if (playerHand.length === 0) return;
    const c = drawCard();
    playerHand.push(c);
    await dealCardTo(playerHandEl, c);
    updateScores();
    updateDeckCount();
  });

  dealerHandEl.addEventListener('click', (e) => {
    const card = e.target.closest('.card.flipped');
    if (card) card.classList.remove('flipped');
  });

  // ---------- init ----------
  shoe = buildShoe();
  initialShoeSize = shoe.length;
  updateDeckCount();

  const hash = location.hash.match(/^#mode-([123])(-deal)?$/);
  if (hash) {
    showGame(Number(hash[1]));
    if (hash[2]) setTimeout(dealNewHand, 100);
  }
})();
