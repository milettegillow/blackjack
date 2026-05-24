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
  const STARTING_BANKROLL = 1000;

  // ---------- state ----------
  let shoe = [];
  let initialShoeSize = 0;
  let dealerHand = [];
  let playerHands = [];
  let activeHandIndex = 0;
  let phase = 'idle';            // 'idle' | 'dealing' | 'player' | 'dealer' | 'over'
  let currentMode = null;        // 1, 2, 3, or null on home
  let bankroll = STARTING_BANKROLL;
  let currentBet = 0;
  let settling = false;          // true during the 2.4s bet-result animation

  // ---------- DOM refs ----------
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
  const handIndicatorEl = document.getElementById('handIndicator');
  const messageEl = document.getElementById('message');
  const dealBtn = document.getElementById('dealBtn');
  const hitBtn = document.getElementById('hitBtn');
  const standBtn = document.getElementById('standBtn');
  const doubleBtn = document.getElementById('doubleBtn');
  const splitBtn = document.getElementById('splitBtn');

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

  async function renderActiveHand() {
    playerHandEl.innerHTML = '';
    const hand = playerHands[activeHandIndex];
    if (!hand) return;
    for (const card of hand.cards) {
      playerHandEl.appendChild(renderCard(card));
    }
    layoutHand(playerHandEl);
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
    const activeHand = playerHands[activeHandIndex];
    if (!activeHand || activeHand.cards.length === 0) {
      playerScoreEl.textContent = '';
      playerScoreEl.className = 'hand-score';
    } else {
      const ev = evaluateHand(activeHand.cards);
      playerScoreEl.textContent = ev.total;
      playerScoreEl.className = 'hand-score';
      if (ev.isBlackjack) playerScoreEl.classList.add('blackjack');
      else if (ev.isBust) playerScoreEl.classList.add('bust');
    }

    if (dealerHand.length === 0) {
      dealerScoreEl.textContent = '';
      dealerScoreEl.className = 'hand-score';
    } else if (phase === 'dealer' || phase === 'over') {
      const ev = evaluateHand(dealerHand);
      dealerScoreEl.textContent = ev.total;
      dealerScoreEl.className = 'hand-score';
      if (ev.isBust) dealerScoreEl.classList.add('bust');
      else if (ev.isBlackjack) dealerScoreEl.classList.add('blackjack');
    } else {
      dealerScoreEl.textContent = rankValue(dealerHand[0].rank);
      dealerScoreEl.className = 'hand-score';
    }
  }

  function updateDeckCount() {
    const el = document.getElementById('deckCount');
    if (el) el.textContent = `${shoe.length} / ${initialShoeSize}`;
  }

  // ---------- bankroll / bet ----------
  function resetBankroll() {
    bankroll = STARTING_BANKROLL;
    currentBet = 0;
    updateBankrollUI();
    updateCurrentBetUI();
  }

  function updateBankrollUI() {
    const el = document.getElementById('bankrollAmount');
    if (el) el.textContent = `$${bankroll.toLocaleString()}`;
  }

  function updateCurrentBetUI() {
    const el = document.getElementById('currentBet');
    if (el) el.textContent = `$${currentBet.toLocaleString()}`;
  }

  // Eager bet flow: chips leave the bankroll the moment they're tapped, so the
  // bankroll always reflects what's left in the rack. At resolution, the dealer
  // matches winnings + returns the original wager; losses are already gone.
  function settleAndShowResult(results) {
    if (currentMode !== 3) return;
    let netChange = 0;        // flows back to bankroll after fade
    let displayAmount = 0;    // shown on the floating indicator (winnings only)
    results.forEach((r, i) => {
      const h = playerHands[i];
      if (r === 'win') {
        netChange += h.bet * 2;       // bet returned + 1:1 winnings
        displayAmount += h.bet;
      } else if (r === 'blackjack') {
        const winnings = Math.floor(h.bet * 1.5);
        netChange += h.bet + winnings;
        displayAmount += winnings;
      } else if (r === 'push') {
        netChange += h.bet;           // bet returned, no winnings
      } else if (r === 'lose') {
        displayAmount -= h.bet;       // chips already gone from bankroll
      }
    });
    showBetResult(displayAmount, results, netChange);
  }

  function showBetResult(displayAmount, results, netChange) {
    const el = document.getElementById('betResult');
    if (!el) return;
    if (results.every(r => r === 'push')) {
      el.textContent = 'Push';
      el.className = 'bet-result show push';
    } else if (displayAmount > 0) {
      el.textContent = `+$${displayAmount.toLocaleString()}`;
      el.className = 'bet-result show positive';
    } else if (displayAmount < 0) {
      el.textContent = `-$${Math.abs(displayAmount).toLocaleString()}`;
      el.className = 'bet-result show negative';
    } else {
      el.textContent = 'Push';
      el.className = 'bet-result show push';
    }
    settling = true;
    updateButtonStates();
    setTimeout(() => {
      bankroll += netChange;
      currentBet = 0;
      playerHands.forEach(h => { h.bet = 0; });
      el.className = 'bet-result';
      updateBankrollUI();
      updateCurrentBetUI();
      settling = false;
      showChipRack();
      updateButtonStates();
    }, 2400);
  }

  // ---------- chip rack visibility ----------
  function hideChipRack() {
    if (currentMode === 3) chipRackM3.classList.add('hidden');
    if (currentMode === 2) chipRackM2.classList.add('hidden');
  }

  function showChipRack() {
    if (currentMode === 3) chipRackM3.classList.remove('hidden');
    if (currentMode === 2) chipRackM2.classList.remove('hidden');
  }

  // ---------- phase + buttons ----------
  function setPhase(p) {
    phase = p;
    updateButtonStates();
    updateScores();
  }

  function canSplit(hand) {
    if (!hand || hand.cards.length !== 2) return false;
    if (playerHands.length >= 4) return false;
    return rankValue(hand.cards[0].rank) === rankValue(hand.cards[1].rank);
  }

  function updateButtonStates() {
    const dealAllowed = (phase === 'idle' || phase === 'over');
    const brokeInMode3 = currentMode === 3 && bankroll <= 0 && currentBet === 0;
    dealBtn.disabled = !dealAllowed || settling || brokeInMode3;

    if (phase !== 'player') {
      hitBtn.disabled = standBtn.disabled = doubleBtn.disabled = splitBtn.disabled = true;
      return;
    }
    const hand = playerHands[activeHandIndex];
    hitBtn.disabled = false;
    standBtn.disabled = false;
    const cantAfford = currentMode === 3 && hand && hand.bet > bankroll;
    doubleBtn.disabled = !(hand && hand.cards.length === 2) || cantAfford;
    splitBtn.disabled = !canSplit(hand) || cantAfford;
  }

  // ---------- message + hand indicator ----------
  function showMessage(text, kind) {
    messageEl.textContent = text;
    messageEl.className = 'message show ' + kind;
  }

  function hideMessage() {
    messageEl.className = 'message';
    messageEl.textContent = '';
  }

  function updateHandIndicator() {
    if (playerHands.length <= 1) {
      handIndicatorEl.classList.add('hidden');
      handIndicatorEl.textContent = '';
    } else {
      handIndicatorEl.classList.remove('hidden');
      handIndicatorEl.textContent = `Hand ${activeHandIndex + 1} of ${playerHands.length}`;
    }
  }

  function hideHandIndicator() {
    handIndicatorEl.classList.add('hidden');
    handIndicatorEl.textContent = '';
  }

  // ---------- hand makers ----------
  function makeHand(bet = 0) {
    return { cards: [], stood: false, doubled: false, bust: false, blackjack: false, bet };
  }

  // ---------- deal flow ----------
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
    if (phase !== 'idle' && phase !== 'over') return;
    if (settling) return;

    dealerHandEl.innerHTML = '';
    playerHandEl.innerHTML = '';
    dealerHand = [];
    hideMessage();
    hideHandIndicator();

    // Eager bet flow: chips are already off the bankroll. Just lock the
    // currentBet onto the hand; bankroll + currentBet display are unchanged.
    let handBet = 0;
    if (currentMode === 3) handBet = currentBet;

    playerHands = [makeHand(handBet)];
    activeHandIndex = 0;

    setPhase('dealing');
    hideChipRack();

    const c1 = drawCard(); playerHands[0].cards.push(c1);
    await dealCardTo(playerHandEl, c1);

    const c2 = drawCard(); dealerHand.push(c2);
    await dealCardTo(dealerHandEl, c2);

    const c3 = drawCard(); playerHands[0].cards.push(c3);
    await dealCardTo(playerHandEl, c3);

    const c4 = drawCard(); dealerHand.push(c4);
    await dealCardTo(dealerHandEl, c4, true);

    updateScores();
    updateDeckCount();

    const pEval = evaluateHand(playerHands[0].cards);
    const dEval = evaluateHand(dealerHand);
    if (pEval.isBlackjack || dEval.isBlackjack) {
      setPhase('dealer');
      await revealDealerHole();
      let result;
      if (pEval.isBlackjack && dEval.isBlackjack) result = 'push';
      else if (pEval.isBlackjack) result = 'blackjack';
      else result = 'lose';

      settleAndShowResult([result]);
      endHand(result);
      return;
    }

    setPhase('player');
  }

  // ---------- player actions ----------
  async function playerHit() {
    if (phase !== 'player') return;
    const hand = playerHands[activeHandIndex];
    const c = drawCard();
    hand.cards.push(c);
    await dealCardTo(playerHandEl, c);
    updateScores();
    updateDeckCount();

    const ev = evaluateHand(hand.cards);
    if (ev.isBust) { hand.bust = true; await advanceHand(); }
    else if (ev.total === 21) await advanceHand();
    else updateButtonStates();
  }

  async function playerStand() {
    if (phase !== 'player') return;
    playerHands[activeHandIndex].stood = true;
    await advanceHand();
  }

  async function playerDouble() {
    if (phase !== 'player') return;
    const hand = playerHands[activeHandIndex];
    if (hand.cards.length !== 2) return;
    if (currentMode === 3 && hand.bet > bankroll) return;

    if (currentMode === 3) {
      bankroll -= hand.bet;
      currentBet += hand.bet;
      hand.bet *= 2;
      updateBankrollUI();
      updateCurrentBetUI();
    }
    hand.doubled = true;

    const c = drawCard();
    hand.cards.push(c);
    await dealCardTo(playerHandEl, c);
    updateScores();
    updateDeckCount();
    const ev = evaluateHand(hand.cards);
    if (ev.isBust) hand.bust = true;
    await advanceHand();
  }

  async function playerSplit() {
    if (phase !== 'player') return;
    const hand = playerHands[activeHandIndex];
    if (!canSplit(hand)) return;
    if (currentMode === 3 && hand.bet > bankroll) return;

    if (currentMode === 3) {
      bankroll -= hand.bet;
      currentBet += hand.bet;
      updateBankrollUI();
      updateCurrentBetUI();
    }

    const second = hand.cards.pop();
    const newHand = makeHand(hand.bet);
    newHand.cards.push(second);
    playerHands.splice(activeHandIndex + 1, 0, newHand);

    await renderActiveHand();

    const c = drawCard();
    hand.cards.push(c);
    await dealCardTo(playerHandEl, c);

    updateScores();
    updateDeckCount();
    updateHandIndicator();

    if (hand.cards[0].rank === 'A') {
      hand.stood = true;
      await advanceHand();
      return;
    }

    updateButtonStates();
  }

  // ---------- advance + dealer ----------
  async function advanceHand() {
    if (activeHandIndex + 1 < playerHands.length) {
      activeHandIndex++;
      updateHandIndicator();
      const next = playerHands[activeHandIndex];

      if (next.cards.length === 1) {
        await renderActiveHand();
        const c = drawCard();
        next.cards.push(c);
        await dealCardTo(playerHandEl, c);

        if (next.cards[0].rank === 'A') {
          next.stood = true;
          await advanceHand();
          return;
        }
      } else {
        await renderActiveHand();
      }

      updateScores();
      updateDeckCount();
      setPhase('player');
      return;
    }

    await dealerPlay();
  }

  async function dealerPlay() {
    setPhase('dealer');
    await revealDealerHole();

    const allBusted = playerHands.every(h => h.bust);

    if (!allBusted) {
      while (true) {
        const ev = evaluateHand(dealerHand);
        if (ev.total > 21) break;
        if (ev.total > 17) break;
        if (ev.total === 17 && !ev.soft) break;
        await sleep(450);
        const c = drawCard();
        dealerHand.push(c);
        await dealCardTo(dealerHandEl, c);
        updateScores();
        updateDeckCount();
      }
    }

    resolveHands();
  }

  async function revealDealerHole() {
    const flipped = dealerHandEl.querySelector('.card.flipped');
    if (flipped) {
      flipped.classList.remove('flipped');
      await sleep(550);
    }
    updateScores();
  }

  // ---------- resolution ----------
  function resolveHands() {
    const dEval = evaluateHand(dealerHand);
    const results = playerHands.map(h => {
      if (h.bust) return 'lose';
      if (dEval.isBust) return 'win';
      const pEval = evaluateHand(h.cards);
      if (pEval.total > dEval.total) return 'win';
      if (pEval.total < dEval.total) return 'lose';
      return 'push';
    });

    settleAndShowResult(results);

    if (playerHands.length === 1) {
      endHand(results[0]);
    } else {
      const wins = results.filter(r => r === 'win').length;
      const losses = results.filter(r => r === 'lose').length;
      const pushes = results.filter(r => r === 'push').length;
      const parts = [];
      if (wins) parts.push(`${wins}W`);
      if (losses) parts.push(`${losses}L`);
      if (pushes) parts.push(`${pushes}P`);
      showMessage(parts.join(' · '), 'mixed');
      setPhase('over');
      if (currentMode !== 3) showChipRack();
    }
  }

  function endHand(result) {
    let text, kind;
    if (result === 'blackjack') { text = 'Blackjack!'; kind = 'win'; }
    else if (result === 'win')  { text = 'You Win';   kind = 'win'; }
    else if (result === 'lose') { text = 'Dealer Wins'; kind = 'lose'; }
    else if (result === 'push') { text = 'Push';      kind = 'push'; }
    showMessage(text, kind);
    setPhase('over');
    if (currentMode !== 3) showChipRack();
  }

  // ---------- reset + routing ----------
  function resetGameState() {
    shoe = buildShoe();
    initialShoeSize = shoe.length;
    dealerHand = [];
    playerHands = [];
    activeHandIndex = 0;
    dealerHandEl.innerHTML = '';
    playerHandEl.innerHTML = '';
    hideMessage();
    hideHandIndicator();
    setPhase('idle');
    updateDeckCount();
  }

  function showHome() {
    currentMode = null;
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
    currentMode = mode;
    if (mode === 3) resetBankroll();
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
  hitBtn.addEventListener('click', playerHit);
  standBtn.addEventListener('click', playerStand);
  doubleBtn.addEventListener('click', playerDouble);
  splitBtn.addEventListener('click', playerSplit);

  // Mode 3 chip taps (eager — bankroll moves immediately)
  chipRackM3.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      if (currentMode !== 3) return;
      if (phase !== 'idle' && phase !== 'over') return;
      const value = chip.dataset.bet;
      if (value === '0') {
        // Skip: return any chips already on the table
        bankroll += currentBet;
        currentBet = 0;
      } else {
        const amount = parseInt(value, 10);
        if (amount > bankroll) return;
        bankroll -= amount;
        currentBet += amount;
      }
      updateBankrollUI();
      updateCurrentBetUI();
      updateButtonStates();
    });
  });

  document.getElementById('clearBet').addEventListener('click', () => {
    if (currentMode !== 3) return;
    if (phase !== 'idle' && phase !== 'over') return;
    bankroll += currentBet;
    currentBet = 0;
    updateBankrollUI();
    updateCurrentBetUI();
    updateButtonStates();
  });

  document.getElementById('resetBankroll').addEventListener('click', () => {
    if (currentMode !== 3) return;
    if (phase !== 'idle' && phase !== 'over') return;
    resetBankroll();
    updateButtonStates();
  });

  // ---------- init + deep-link ----------
  shoe = buildShoe();
  initialShoeSize = shoe.length;
  updateDeckCount();

  // URL hash supports test sequences: #mode-N-<action>-<action>-...
  // Actions: deal, hit, stand, double, split, bet<amount> (e.g. bet25), clear, reset
  const parts = location.hash.replace(/^#/, '').split('-');
  if (parts[0] === 'mode' && /^[123]$/.test(parts[1] || '')) {
    showGame(Number(parts[1]));
    const actions = parts.slice(2);
    if (actions.length) {
      setTimeout(async () => {
        for (const action of actions) {
          const betMatch = action.match(/^bet(\d+)$/);
          if (betMatch) {
            const amt = parseInt(betMatch[1], 10);
            if (currentMode === 3 && (phase === 'idle' || phase === 'over') && amt <= bankroll) {
              bankroll -= amt;
              currentBet += amt;
              updateBankrollUI();
              updateCurrentBetUI();
              updateButtonStates();
            }
          }
          else if (action === 'deal')   await dealNewHand();
          else if (action === 'hit')    await playerHit();
          else if (action === 'stand')  await playerStand();
          else if (action === 'double') await playerDouble();
          else if (action === 'split')  await playerSplit();
          else if (action === 'clear')  {
            bankroll += currentBet;
            currentBet = 0;
            updateBankrollUI();
            updateCurrentBetUI();
          }
          else if (action === 'reset')  resetBankroll();
          await sleep(250);
        }
      }, 150);
    }
  }
})();
