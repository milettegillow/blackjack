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

  // Mode 2 (Learn to Count) state
  let runningCount = 0;
  let countSubMode = 'visible';  // 'visible' | 'hidden' | 'bet-sizing'
  let mode2HandsPlayed = 0;      // counts hands since last quiz
  let pendingBetChoice = null;   // chip user committed before dealing
  let activeTutorial = 'play';   // 'play' | 'count'
  let quizGuess = 0;
  let quizPhase = 'guess';       // 'guess' | 'reveal'
  let pendingBetTC = 0;          // TC captured at moment of chip click

  // ---------- DOM refs ----------
  const home = document.getElementById('screen-home');
  const game = document.getElementById('gameScreen');
  const topMode = document.getElementById('topMode');
  const backBtn = document.getElementById('backBtn');
  const countPanel = document.getElementById('countPanel');
  const deckIndicator = document.getElementById('deckIndicator');
  const moneyRow = document.getElementById('moneyRow');
  const chipsRackThree = document.getElementById('chipsRackThree');
  const chipsRackRamp = document.getElementById('chipsRackRamp');
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
      updateButtonStates();
      if (currentMode === 3 && bankroll < 25) showBankruptModal();
    }, 2400);
  }

  function showBankruptModal() {
    const modal = document.getElementById('bankruptModal');
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }

  function hideBankruptModal() {
    const modal = document.getElementById('bankruptModal');
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }

  // ---------- tutorial (Mode 1) ----------
  const TUTORIAL_LESSONS = [
    {
      title: 'The Goal',
      visual: `
        <div class="tut-cards">
          <div class="tut-hand">
            <div class="tut-cards-row">
              <img src="/assets/cards/KS.svg" alt="">
              <img src="/assets/cards/9H.svg" alt="">
            </div>
            <div class="tut-label">You · 19</div>
          </div>
          <div class="tut-vs">vs</div>
          <div class="tut-hand">
            <div class="tut-cards-row">
              <img src="/assets/cards/10D.svg" alt="">
              <img src="/assets/cards/7C.svg" alt="">
            </div>
            <div class="tut-label">Dealer · 17</div>
          </div>
        </div>`,
      body: `Get closer to <strong>21</strong> than the dealer, without going over. Beat the dealer's hand and you win.`
    },
    {
      title: 'Card Values',
      visual: `
        <div class="tut-cards-row tut-spaced">
          <div class="tut-mini"><img src="/assets/cards/2S.svg" alt=""><div class="tut-value">2</div></div>
          <div class="tut-mini"><img src="/assets/cards/7H.svg" alt=""><div class="tut-value">7</div></div>
          <div class="tut-mini"><img src="/assets/cards/QC.svg" alt=""><div class="tut-value">10</div></div>
          <div class="tut-mini"><img src="/assets/cards/AD.svg" alt=""><div class="tut-value">1 or 11</div></div>
        </div>`,
      body: `Number cards count as their face value. <strong>J, Q, K</strong> all count as 10. An <strong>Ace</strong> counts as either 1 or 11 - whichever helps you.`
    },
    {
      title: 'Hit, Stand, Bust',
      visual: `
        <div class="tut-cards">
          <div class="tut-hand">
            <div class="tut-cards-row">
              <img src="/assets/cards/8H.svg" alt="">
              <img src="/assets/cards/6C.svg" alt="">
              <img src="/assets/cards/KS.svg" alt="">
            </div>
            <div class="tut-label tut-bust">24 · Bust</div>
          </div>
        </div>`,
      body: `<strong>Hit</strong> = take another card. <strong>Stand</strong> = keep your total. If your total goes over 21, you <strong>bust</strong> and lose immediately, regardless of what the dealer does.`
    },
    {
      title: 'Soft and Hard Hands',
      visual: `
        <div class="tut-cards">
          <div class="tut-hand">
            <div class="tut-cards-row">
              <img src="/assets/cards/AH.svg" alt="">
              <img src="/assets/cards/6C.svg" alt="">
            </div>
            <div class="tut-label">Soft 17</div>
          </div>
          <div class="tut-hand">
            <div class="tut-cards-row">
              <img src="/assets/cards/AH.svg" alt="">
              <img src="/assets/cards/6C.svg" alt="">
              <img src="/assets/cards/QD.svg" alt="">
            </div>
            <div class="tut-label">Hard 17</div>
          </div>
        </div>`,
      body: `A <strong>soft</strong> hand has an Ace counted as 11 - you can't bust on the next card because the Ace flips to 1 if needed. A <strong>hard</strong> hand has no Ace, or the Ace is forced to count as 1.`
    },
    {
      title: "The Dealer's Rules",
      visual: `
        <div class="tut-cards">
          <div class="tut-hand">
            <div class="tut-cards-row">
              <img src="/assets/cards/7C.svg" alt="">
              <img src="/assets/cards/9H.svg" alt="">
            </div>
            <div class="tut-label">16 · Must hit</div>
          </div>
          <div class="tut-hand">
            <div class="tut-cards-row">
              <img src="/assets/cards/10S.svg" alt="">
              <img src="/assets/cards/7D.svg" alt="">
            </div>
            <div class="tut-label">17 · Must stand</div>
          </div>
        </div>`,
      body: `After you play, the dealer reveals their hidden card and must <strong>hit until reaching 17 or more</strong>. They don't get to choose. Whoever has the higher total without busting wins.`
    },
    {
      title: 'Double and Split',
      visual: `
        <div class="tut-cards">
          <div class="tut-hand">
            <div class="tut-cards-row">
              <img src="/assets/cards/5S.svg" alt="">
              <img src="/assets/cards/6H.svg" alt="">
            </div>
            <div class="tut-label">11 · Double</div>
          </div>
          <div class="tut-hand">
            <div class="tut-cards-row">
              <img src="/assets/cards/8S.svg" alt="">
              <img src="/assets/cards/8H.svg" alt="">
            </div>
            <div class="tut-label">Pair · Split</div>
          </div>
        </div>`,
      body: `<strong>Double</strong> = double your bet, take exactly one more card. <strong>Split</strong> = if your two cards are a pair, play them as two separate hands. <em>Always split Aces and 8s. Never split 10s.</em>`
    },
    {
      title: 'Round Review',
      visual: `
        <div class="tut-review-mockup">
          <div class="review-title">Round Review</div>
          <div class="review-line correct">✓ Hit on 14 vs 6 - correct</div>
          <div class="review-line miss">✗ Stood on 16 vs 10 - should have hit</div>
          <div class="review-summary">One mistake this round.</div>
        </div>`,
      body: `For every combination of your hand and the dealer's upcard, there's a mathematically optimal move. After each round, this mode will <em>review every decision you made</em> and tell you if it was the right call - even if you won by getting lucky, or lost despite playing perfectly.`
    }
  ];

  const COUNT_LESSONS = [
    {
      title: 'Card Counting',
      visual: `
        <div class="tut-cards-row tut-spaced">
          <div class="tut-mini"><img src="/assets/cards/5H.svg" alt=""><div class="tut-value plus">+1</div></div>
          <div class="tut-mini"><img src="/assets/cards/KD.svg" alt=""><div class="tut-value minus">−1</div></div>
          <div class="tut-mini"><img src="/assets/cards/8C.svg" alt=""><div class="tut-value zero">0</div></div>
        </div>`,
      body: `Card counting tracks the ratio of high cards to low cards remaining in the shoe. When more high cards are left, the player has the edge - and you should bet more.`
    },
    {
      title: 'Hi-Lo Values',
      visual: `
        <div class="hilo-groups">
          <div class="hilo-group plus">
            <div class="hilo-cards">
              <img src="/assets/cards/2S.svg" alt="">
              <img src="/assets/cards/3D.svg" alt="">
              <img src="/assets/cards/4H.svg" alt="">
              <img src="/assets/cards/5C.svg" alt="">
              <img src="/assets/cards/6S.svg" alt="">
            </div>
            <div class="hilo-label">+1</div>
          </div>
          <div class="hilo-group zero">
            <div class="hilo-cards">
              <img src="/assets/cards/7H.svg" alt="">
              <img src="/assets/cards/8C.svg" alt="">
              <img src="/assets/cards/9D.svg" alt="">
            </div>
            <div class="hilo-label">0</div>
          </div>
          <div class="hilo-group minus">
            <div class="hilo-cards">
              <img src="/assets/cards/10S.svg" alt="">
              <img src="/assets/cards/JD.svg" alt="">
              <img src="/assets/cards/QH.svg" alt="">
              <img src="/assets/cards/KC.svg" alt="">
              <img src="/assets/cards/AS.svg" alt="">
            </div>
            <div class="hilo-label">−1</div>
          </div>
        </div>`,
      body: `In the <strong>Hi-Lo</strong> system, every card has a value. Low cards (2–6) are <em>+1</em>. Middle cards (7–9) are <em>0</em>. High cards (10, J, Q, K, A) are <em>−1</em>.`
    },
    {
      title: 'Running Count',
      visual: `
        <div class="rc-sequence">
          <div class="rc-step"><img src="/assets/cards/5S.svg" alt=""><div class="rc-val plus">+1</div><div class="rc-total">RC: +1</div></div>
          <div class="rc-step"><img src="/assets/cards/KH.svg" alt=""><div class="rc-val minus">−1</div><div class="rc-total">RC: 0</div></div>
          <div class="rc-step"><img src="/assets/cards/4D.svg" alt=""><div class="rc-val plus">+1</div><div class="rc-total">RC: +1</div></div>
          <div class="rc-step"><img src="/assets/cards/8C.svg" alt=""><div class="rc-val zero">0</div><div class="rc-total">RC: +1</div></div>
        </div>`,
      body: `As each card is dealt, add its Hi-Lo value to your running total. This is the <strong>running count</strong>.`
    },
    {
      title: 'True Count',
      visual: `
        <div class="tc-calc">
          <div class="tc-piece"><div class="tc-num">+6</div><div class="tc-cap">Running</div></div>
          <div class="tc-op">÷</div>
          <div class="tc-piece"><div class="tc-num">2</div><div class="tc-cap">Decks left</div></div>
          <div class="tc-op">=</div>
          <div class="tc-piece tc-result"><div class="tc-num">+3</div><div class="tc-cap">True</div></div>
        </div>`,
      body: `The <strong>true count</strong> divides the running count by the number of decks remaining in the shoe. This adjusts for the size of the deck - a +6 count is much stronger with one deck left than with six.`
    },
    {
      title: 'When You Win',
      visual: `
        <div class="edge-bar">
          <div class="edge-row"><span class="edge-label">TC ≤ 0</span><span class="edge-house">House edge</span></div>
          <div class="edge-row"><span class="edge-label">TC = +1</span><span class="edge-even">Roughly even</span></div>
          <div class="edge-row"><span class="edge-label">TC ≥ +2</span><span class="edge-player">Player edge</span></div>
        </div>`,
      body: `A positive true count means more 10s and Aces are still in the shoe - which favours the player. Around <em>+2 or higher</em>, the maths actually tips in your favour.`
    },
    {
      title: 'The Bet Ramp',
      visual: `
        <div class="ramp">
          <div class="ramp-step"><div class="ramp-tc">TC ≤ −1</div><div class="ramp-bet">Skip</div></div>
          <div class="ramp-step"><div class="ramp-tc">TC &lt; +2</div><div class="ramp-bet">1×</div></div>
          <div class="ramp-step"><div class="ramp-tc">+2 to +3</div><div class="ramp-bet">2×</div></div>
          <div class="ramp-step"><div class="ramp-tc">+3 to +4</div><div class="ramp-bet">4×</div></div>
          <div class="ramp-step ramp-top"><div class="ramp-tc">TC ≥ +4</div><div class="ramp-bet">8×</div></div>
        </div>`,
      body: `Counting is only useful if you <em>bet more when you have the edge</em>. Skip cold counts. Bet small when neutral. Ramp up as the count rises.`
    },
    {
      title: 'Three Practice Modes',
      visual: `
        <div class="submode-preview">
          <div class="sp-row"><strong>Visible</strong> - count updates live, badges flash on each card</div>
          <div class="sp-row"><strong>Hidden</strong> - count is hidden, periodic accuracy checks</div>
          <div class="sp-row"><strong>Bet Sizing</strong> - practice your bet ramp with five chip options</div>
        </div>`,
      body: `Before each hand, choose to <strong>skip</strong> (bad count) or how much to <strong>bet</strong> (neutral or good count). After each hand you'll see whether your bet decision matched the count.`
    }
  ];

  let tutorialIndex = 0;

  function activeTutorialLessons() {
    return activeTutorial === 'count' ? COUNT_LESSONS : TUTORIAL_LESSONS;
  }

  function showTutorial() {
    activeTutorial = 'play';
    tutorialIndex = 0;
    renderTutorial();
    document.getElementById('tutorialModal').classList.remove('hidden');
  }

  function showCountTutorial() {
    activeTutorial = 'count';
    tutorialIndex = 0;
    renderTutorial();
    document.getElementById('tutorialModal').classList.remove('hidden');
  }

  function renderTutorial() {
    const lessons = activeTutorialLessons();
    const lesson = lessons[tutorialIndex];
    document.getElementById('tutorialProgress').textContent = `${tutorialIndex + 1} / ${lessons.length}`;
    document.getElementById('tutorialTitle').textContent = lesson.title;
    document.getElementById('tutorialBody').innerHTML = `
      <div class="tutorial-visual">${lesson.visual}</div>
      <div class="tutorial-text">${lesson.body}</div>
    `;
    const nextBtn = document.getElementById('tutorialNext');
    nextBtn.textContent = tutorialIndex === lessons.length - 1 ? 'Start Playing' : 'Next';
  }

  function hideTutorial() {
    document.getElementById('tutorialModal').classList.add('hidden');
  }

  // ---------- Hi-Lo count tracking (Mode 2) ----------
  function hiloValue(rank) {
    if (['2','3','4','5','6'].includes(rank)) return 1;
    if (['7','8','9'].includes(rank)) return 0;
    return -1; // 10, J, Q, K, A
  }

  function getTrueCount() {
    const decksRemaining = Math.max(0.5, shoe.length / 52);
    return runningCount / decksRemaining;
  }

  function formatTC(tc) {
    const r = tc.toFixed(1);
    return (tc >= 0 ? '+' : '') + r;
  }

  function updateCountUI() {
    if (currentMode !== 2) return;
    const decksRemaining = Math.max(0.5, shoe.length / 52);
    const tc = runningCount / decksRemaining;
    const rcEl   = document.getElementById('runningCount');
    const tcEl   = document.getElementById('trueCount');
    const dEl    = document.getElementById('decksLeft');
    const advEl  = document.getElementById('advantage');
    if (rcEl) rcEl.textContent = runningCount >= 0 ? `+${runningCount}` : `${runningCount}`;
    if (tcEl) {
      tcEl.textContent = formatTC(tc);
      tcEl.classList.remove('pos', 'strong-pos', 'neg');
      if (tc >= 2) tcEl.classList.add('strong-pos');
      else if (tc >= 1) tcEl.classList.add('pos');
      else if (tc <= -1) tcEl.classList.add('neg');
    }
    if (dEl) dEl.textContent = decksRemaining.toFixed(1);
    if (advEl) {
      advEl.classList.remove('pos', 'strong-pos', 'neg');
      if (tc >= 2) { advEl.textContent = 'PLAYER'; advEl.classList.add('strong-pos'); }
      else if (tc >= 1) { advEl.textContent = 'EDGE'; advEl.classList.add('pos'); }
      else if (tc <= -1) { advEl.textContent = 'HOUSE'; advEl.classList.add('neg'); }
      else { advEl.textContent = 'NEUTRAL'; }
    }
  }

  function applyHiloOnDeal(card) {
    if (currentMode !== 2) return;
    runningCount += hiloValue(card.rank);
    updateCountUI();
  }

  function flashCountBadge(cardEl, rank) {
    if (currentMode !== 2) return;
    if (countSubMode === 'hidden') return;
    if (!cardEl) return;
    const v = hiloValue(rank);
    const sign = v > 0 ? 'plus' : v < 0 ? 'minus' : 'zero';
    const text = v > 0 ? `+${v}` : `${v}`;
    const badge = document.createElement('div');
    badge.className = `count-badge ${sign}`;
    badge.textContent = text;
    cardEl.appendChild(badge);
    setTimeout(() => badge.remove(), 1900);
  }

  function resetShoeAndCount() {
    shoe = buildShoe();
    initialShoeSize = shoe.length;
    runningCount = 0;
    updateDeckCount();
    updateCountUI();
  }

  // ---------- basic strategy (Mode 1 coaching) ----------
  function basicStrategy(handCards, dealerUp, canDoubleNow, canSplitNow) {
    const dv = rankValue(dealerUp.rank);
    const dKey = dv === 11 ? 'A' : String(dv);

    if (canSplitNow && handCards.length === 2 && rankValue(handCards[0].rank) === rankValue(handCards[1].rank)) {
      const r = handCards[0].rank;
      const pairKey = r === 'A' ? 'A' : (['J','Q','K','T'].includes(r)) ? '10' : r;
      const PAIRS = {
        'A':  {'2':'P','3':'P','4':'P','5':'P','6':'P','7':'P','8':'P','9':'P','10':'P','A':'P'},
        '10': {'2':'S','3':'S','4':'S','5':'S','6':'S','7':'S','8':'S','9':'S','10':'S','A':'S'},
        '9':  {'2':'P','3':'P','4':'P','5':'P','6':'P','7':'S','8':'P','9':'P','10':'S','A':'S'},
        '8':  {'2':'P','3':'P','4':'P','5':'P','6':'P','7':'P','8':'P','9':'P','10':'P','A':'P'},
        '7':  {'2':'P','3':'P','4':'P','5':'P','6':'P','7':'P','8':'H','9':'H','10':'H','A':'H'},
        '6':  {'2':'P','3':'P','4':'P','5':'P','6':'P','7':'H','8':'H','9':'H','10':'H','A':'H'},
        '5':  {'2':'D','3':'D','4':'D','5':'D','6':'D','7':'D','8':'D','9':'D','10':'H','A':'H'},
        '4':  {'2':'H','3':'H','4':'H','5':'P','6':'P','7':'H','8':'H','9':'H','10':'H','A':'H'},
        '3':  {'2':'P','3':'P','4':'P','5':'P','6':'P','7':'P','8':'H','9':'H','10':'H','A':'H'},
        '2':  {'2':'P','3':'P','4':'P','5':'P','6':'P','7':'P','8':'H','9':'H','10':'H','A':'H'}
      };
      const a = PAIRS[pairKey] && PAIRS[pairKey][dKey];
      if (a) return a;
    }

    const ev = evaluateHand(handCards);

    if (ev.soft) {
      const t = ev.total;
      if (t >= 20) return 'S';
      if (t === 19) return dKey === '6' ? 'Ds' : 'S';
      if (t === 18) {
        if (['3','4','5','6'].includes(dKey)) return 'Ds';
        if (['2','7','8'].includes(dKey)) return 'S';
        return 'H';
      }
      if (t === 17) return ['3','4','5','6'].includes(dKey) ? 'D' : 'H';
      if (t === 16 || t === 15) return ['4','5','6'].includes(dKey) ? 'D' : 'H';
      if (t === 14 || t === 13) return ['5','6'].includes(dKey) ? 'D' : 'H';
      return 'H';
    }

    const t = ev.total;
    if (t >= 17) return 'S';
    if (t >= 13 && t <= 16) return ['2','3','4','5','6'].includes(dKey) ? 'S' : 'H';
    if (t === 12) return ['4','5','6'].includes(dKey) ? 'S' : 'H';
    if (t === 11) return 'D';
    if (t === 10) return ['10','A'].includes(dKey) ? 'H' : 'D';
    if (t === 9)  return ['3','4','5','6'].includes(dKey) ? 'D' : 'H';
    return 'H';
  }

  function strategyToButton(action, canDoubleNow) {
    if (action === 'D')  return canDoubleNow ? 'double' : 'hit';
    if (action === 'Ds') return canDoubleNow ? 'double' : 'stand';
    if (action === 'P')  return 'split';
    if (action === 'H')  return 'hit';
    if (action === 'S')  return 'stand';
    return 'hit';
  }

  function strategyLabel(action) {
    return ({ H: 'Hit', S: 'Stand', D: 'Double', Ds: 'Double', P: 'Split' })[action] || 'Hit';
  }

  // ---------- round review (Mode 1) ----------
  let roundDecisions = [];

  function rankLabel(r) {
    if (r === 'T') return '10';
    return r;
  }

  function pairLabel(r) {
    if (r === 'A') return 'Aces';
    if (r === '10' || r === 'T' || r === 'J' || r === 'Q' || r === 'K') return '10s';
    return r + 's';
  }

  function handDescription(d) {
    if (d.isPair) return `pair of ${pairLabel(d.pairRank)}`;
    if (d.soft) return `soft ${d.total}`;
    return `${d.total}`;
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function shouldHavePhrase(code) {
    const map = { H: 'hit', S: 'stood', D: 'doubled', Ds: 'doubled', P: 'split' };
    return map[code] || 'hit';
  }

  function logDecision(action) {
    if (currentMode !== 1) return;
    const hand = playerHands[activeHandIndex];
    if (!hand || hand.cards.length === 0 || dealerHand.length === 0) return;
    const ev = evaluateHand(hand.cards);
    const canDoubleNow = hand.cards.length === 2;
    const canSplitNow = canSplit(hand);
    const sugg = basicStrategy(hand.cards, dealerHand[0], canDoubleNow, canSplitNow);
    const optimalButton = strategyToButton(sugg, canDoubleNow);
    const isPair = hand.cards.length === 2 && rankValue(hand.cards[0].rank) === rankValue(hand.cards[1].rank);
    roundDecisions.push({
      total: ev.total,
      soft: ev.soft,
      isPair,
      pairRank: isPair ? hand.cards[0].rank : null,
      dealerUp: dealerHand[0].rank,
      actionTaken: action,
      optimalCode: sugg,
      optimalButton
    });
  }

  function renderRoundReview(outcome) {
    if (currentMode !== 1) return;
    const el = document.getElementById('roundReview');
    if (roundDecisions.length === 0) {
      el.classList.remove('show');
      el.innerHTML = '';
      return;
    }
    let html = '<div class="review-title">Round Review</div>';
    let mistakes = 0;
    roundDecisions.forEach(d => {
      const correct = d.actionTaken === d.optimalButton;
      if (!correct) mistakes++;
      const icon = correct ? '✓' : '✗';
      const cls  = correct ? 'correct' : 'miss';
      const action = capitalize(d.actionTaken);
      const hand = handDescription(d);
      const dealer = rankLabel(d.dealerUp);
      if (correct) {
        html += `<div class="review-line ${cls}">${icon} ${action} on ${hand} vs ${dealer} - correct</div>`;
      } else {
        const should = shouldHavePhrase(d.optimalCode);
        html += `<div class="review-line ${cls}">${icon} ${action} on ${hand} vs ${dealer} - should have ${should}</div>`;
      }
    });
    let summary;
    if (mistakes === 0) {
      summary = outcome === 'loss'
        ? `Perfect play. The cards just didn't fall your way.`
        : `Perfect play.`;
    } else {
      summary = mistakes === 1 ? `One mistake this round.` : `${mistakes} mistakes this round.`;
    }
    html += `<div class="review-summary">${summary}</div>`;
    el.innerHTML = html;
    el.classList.add('show');
  }

  // ---------- chip rack disabled state ----------
  function setChipRackDisabled(disabled) {
    document.querySelectorAll('.chip-rack').forEach(r => r.classList.toggle('disabled', disabled));
    moneyRow.classList.toggle('disabled', disabled);
  }

  // ---------- phase + buttons ----------
  function setPhase(p) {
    phase = p;
    updateButtonStates();
    updateScores();
    setChipRackDisabled(phase === 'dealing' || phase === 'player' || phase === 'dealer');
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
    } else {
      const hand = playerHands[activeHandIndex];
      hitBtn.disabled = false;
      standBtn.disabled = false;
      const cantAfford = currentMode === 3 && hand && hand.bet > bankroll;
      doubleBtn.disabled = !(hand && hand.cards.length === 2) || cantAfford;
      splitBtn.disabled = !canSplit(hand) || cantAfford;
    }
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
    if (!faceDown) {
      applyHiloOnDeal(card);
      flashCountBadge(el, card.rank);
    }
  }

  async function dealNewHand() {
    if (phase !== 'idle' && phase !== 'over') return;
    if (settling) return;

    dealerHandEl.innerHTML = '';
    playerHandEl.innerHTML = '';
    dealerHand = [];
    hideMessage();
    hideHandIndicator();

    roundDecisions = [];
    const reviewEl = document.getElementById('roundReview');
    reviewEl.classList.remove('show');
    reviewEl.innerHTML = '';

    // Eager bet flow: chips are already off the bankroll. Just lock the
    // currentBet onto the hand; bankroll + currentBet display are unchanged.
    let handBet = 0;
    if (currentMode === 3) handBet = currentBet;

    playerHands = [makeHand(handBet)];
    activeHandIndex = 0;

    setPhase('dealing');

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
      if (currentMode === 2 && pendingBetChoice) {
        renderBetReview(pendingBetChoice, pendingBetTC);
        mode2HandsPlayed++;
      }
      return;
    }

    setPhase('player');
  }

  // ---------- player actions ----------
  async function playerHit() {
    if (phase !== 'player') return;
    logDecision('hit');
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
    logDecision('stand');
    playerHands[activeHandIndex].stood = true;
    await advanceHand();
  }

  async function playerDouble() {
    if (phase !== 'player') return;
    const hand = playerHands[activeHandIndex];
    if (hand.cards.length !== 2) return;
    if (currentMode === 3 && hand.bet > bankroll) return;

    logDecision('double');

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

    logDecision('split');

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
      if (dealerHand.length >= 2) {
        applyHiloOnDeal(dealerHand[1]);
        flashCountBadge(flipped, dealerHand[1].rank);
      }
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
    }

    // Mode 1: show round review
    const wins = results.filter(r => r === 'win').length;
    const losses = results.filter(r => r === 'lose').length;
    const pushes = results.filter(r => r === 'push').length;
    let outcome;
    if (wins > 0 && losses === 0) outcome = 'win';
    else if (losses > 0 && wins === 0) outcome = 'loss';
    else if (pushes === results.length) outcome = 'push';
    else outcome = 'mixed';
    renderRoundReview(outcome);

    // Mode 2: show bet review (compare chip choice against TC at bet time)
    if (currentMode === 2 && pendingBetChoice) {
      renderBetReview(pendingBetChoice, pendingBetTC);
      mode2HandsPlayed++;
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
  }

  // ---------- reset + routing ----------
  function resetGameState() {
    shoe = buildShoe();
    initialShoeSize = shoe.length;
    dealerHand = [];
    playerHands = [];
    activeHandIndex = 0;
    runningCount = 0;
    pendingBetChoice = null;
    pendingBetTC = 0;
    mode2HandsPlayed = 0;
    dealerHandEl.innerHTML = '';
    playerHandEl.innerHTML = '';
    hideMessage();
    hideHandIndicator();
    hideBankruptModal();
    hideTutorial();
    // clear leftover round-review / bet-review from previous modes
    const reviewEl = document.getElementById('roundReview');
    if (reviewEl) {
      reviewEl.classList.remove('show');
      reviewEl.innerHTML = '';
    }
    roundDecisions = [];
    setPhase('idle');
    updateDeckCount();
  }

  function showHome() {
    currentMode = null;
    resetGameState();
    home.classList.remove('hidden');
    game.classList.add('hidden');
    countPanel.classList.add('hidden');
    countPanel.classList.remove('hidden-mode');
    document.getElementById('checkCountBtn').classList.add('hidden');
    deckIndicator.classList.add('hidden');
    moneyRow.classList.add('hidden');
    document.getElementById('submodeSwitcher').classList.add('hidden');
    document.getElementById('chipsRackThree').classList.add('hidden');
    document.getElementById('chipsRackRamp').classList.add('hidden');
    chipRackM3.classList.add('hidden');
    document.getElementById('dealBtnWrap').classList.remove('hidden');
  }

  function showGame(mode) {
    currentMode = mode;
    if (mode === 3) resetBankroll();
    resetGameState();

    // Mode 2 specifics: fresh shoe + count + sub-mode state
    if (mode === 2) {
      countSubMode = 'visible';
      mode2HandsPlayed = 0;
      pendingBetChoice = null;
      document.querySelectorAll('.submode-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.submode === 'visible');
      });
      runningCount = 0;
    }

    topMode.textContent = MODE_NAMES[mode] || '';
    countPanel.classList.toggle('hidden', mode !== 2);
    deckIndicator.classList.toggle('hidden', mode === 1);
    moneyRow.classList.toggle('hidden', mode !== 3);
    chipRackM3.classList.toggle('hidden', mode !== 3);

    const switcher = document.getElementById('submodeSwitcher');
    switcher.classList.toggle('hidden', mode !== 2);

    // Mode 2 chip racks managed by applySubModeUI
    if (mode === 2) {
      applySubModeUI();
      updateCountUI();
    } else {
      document.getElementById('chipsRackThree').classList.add('hidden');
      document.getElementById('chipsRackRamp').classList.add('hidden');
      countPanel.classList.remove('hidden-mode');
      document.getElementById('checkCountBtn').classList.add('hidden');
    }

    // Deal button is hidden in Mode 2 (chips ARE the deal trigger)
    document.getElementById('dealBtnWrap').classList.toggle('hidden', mode === 2);

    home.classList.add('hidden');
    game.classList.remove('hidden');
    if (mode === 1) showTutorial();
    if (mode === 2) showCountTutorial();
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

  document.getElementById('bankruptHomeBtn').addEventListener('click', () => {
    hideBankruptModal();
    backBtn.click();
  });

  // ---------- Mode 2: sub-mode switcher + applySubModeUI ----------
  function applySubModeUI() {
    const panel  = document.getElementById('countPanel');
    const check  = document.getElementById('checkCountBtn');
    const three  = document.getElementById('chipsRackThree');
    const ramp   = document.getElementById('chipsRackRamp');

    if (countSubMode === 'hidden') {
      panel.classList.add('hidden-mode');
      check.classList.remove('hidden');
    } else {
      panel.classList.remove('hidden-mode');
      check.classList.add('hidden');
    }

    if (countSubMode === 'bet-sizing') {
      three.classList.add('hidden');
      ramp.classList.remove('hidden');
    } else if (currentMode === 2) {
      three.classList.remove('hidden');
      ramp.classList.add('hidden');
    } else {
      three.classList.add('hidden');
      ramp.classList.add('hidden');
    }
  }

  document.querySelectorAll('.submode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (phase !== 'idle' && phase !== 'over') return;
      document.querySelectorAll('.submode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      countSubMode = btn.dataset.submode;
      applySubModeUI();
      resetShoeAndCount();
      clearBetReview();
      mode2HandsPlayed = 0;
    });
  });

  // ---------- Mode 2: Check My Count (3s reveal) ----------
  let checkRevealTimer = null;
  document.getElementById('checkCountBtn').addEventListener('click', () => {
    const panel = document.getElementById('countPanel');
    const btn = document.getElementById('checkCountBtn');
    panel.classList.remove('hidden-mode');
    btn.classList.add('revealed');
    if (checkRevealTimer) clearTimeout(checkRevealTimer);
    checkRevealTimer = setTimeout(() => {
      if (countSubMode === 'hidden') {
        panel.classList.add('hidden-mode');
        btn.classList.remove('revealed');
      }
    }, 3000);
  });

  // ---------- Mode 2: bet review ----------
  function chipLabelForReview(b) {
    return ({
      skip: 'Skipped', low: 'Bet low', high: 'Bet high',
      '1x': 'Bet 1×', '2x': 'Bet 2×', '4x': 'Bet 4×', '8x': 'Bet 8×'
    })[b] || b;
  }

  function optimalChip(tc) {
    if (countSubMode === 'bet-sizing') {
      if (tc <= -1) return 'skip';
      if (tc < 2)  return '1x';
      if (tc < 3)  return '2x';
      if (tc < 4)  return '4x';
      return '8x';
    }
    if (tc <= -1) return 'skip';
    if (tc < 2) return 'low';
    return 'high';
  }

  function renderBetReview(chipChoice, tc) {
    const optimal = optimalChip(tc);
    const correct = chipChoice === optimal;
    const icon = correct ? '✓' : '✗';
    const cls  = correct ? 'correct' : 'miss';
    const choiceLabel  = chipLabelForReview(chipChoice);
    const optimalLabel = chipLabelForReview(optimal);
    const line = correct
      ? `${icon} ${choiceLabel} - TC was ${formatTC(tc)}, that was the call`
      : `${icon} ${choiceLabel} - TC was ${formatTC(tc)}, ${optimalLabel.toLowerCase()} was the call`;

    const html = `
      <div class="review-title">Bet Review</div>
      <div class="review-line ${cls}">${line}</div>
    `;
    const el = document.getElementById('roundReview');
    el.innerHTML = html;
    el.classList.add('show');
  }

  function clearBetReview() {
    const el = document.getElementById('roundReview');
    el.innerHTML = '';
    el.classList.remove('show');
  }

  // ---------- Mode 2: chip click == deal trigger; skipped hand path ----------
  async function handleSkippedHand() {
    renderBetReview(pendingBetChoice, pendingBetTC);
    mode2HandsPlayed++;
  }

  async function onMode2ChipClick(betChoice) {
    if (currentMode !== 2) {
      console.error('[mode2] chip click ignored: currentMode is', currentMode);
      return;
    }
    if (phase !== 'idle' && phase !== 'over') {
      console.error('[mode2] chip click ignored: phase is', phase);
      return;
    }
    if (settling) {
      console.error('[mode2] chip click ignored: settling in progress');
      return;
    }
    if (maybeShowQuiz()) return;
    clearBetReview();
    pendingBetChoice = betChoice;
    pendingBetTC = getTrueCount();
    if (betChoice === 'skip') {
      await handleSkippedHand();
    } else {
      await dealNewHand();
    }
  }

  document.querySelectorAll('.mode2-chips .chip').forEach((c) => {
    c.addEventListener('click', () => onMode2ChipClick(c.dataset.bet));
  });

  // ---------- Mode 2: quiz modal ----------
  function updateQuizValueLabel() {
    document.getElementById('quizValue').textContent =
      quizGuess > 0 ? `+${quizGuess}` : `${quizGuess}`;
  }

  function resetQuiz() {
    quizGuess = 0;
    quizPhase = 'guess';
    updateQuizValueLabel();
    document.getElementById('quizResult').classList.add('hidden');
    document.getElementById('quizSubmit').textContent = 'Submit';
  }

  function maybeShowQuiz() {
    if (currentMode !== 2 || countSubMode !== 'hidden') return false;
    if (mode2HandsPlayed < 6) return false;
    resetQuiz();
    document.getElementById('quizModal').classList.remove('hidden');
    return true;
  }

  document.getElementById('quizMinus').addEventListener('click', () => {
    if (quizPhase !== 'guess') return;
    quizGuess--;
    updateQuizValueLabel();
  });
  document.getElementById('quizPlus').addEventListener('click', () => {
    if (quizPhase !== 'guess') return;
    quizGuess++;
    updateQuizValueLabel();
  });
  document.getElementById('quizSkip').addEventListener('click', () => {
    document.getElementById('quizModal').classList.add('hidden');
    mode2HandsPlayed = 0;
    resetQuiz();
  });
  document.getElementById('quizSubmit').addEventListener('click', () => {
    if (quizPhase === 'guess') {
      const actual = runningCount;
      const resultEl = document.getElementById('quizResult');
      if (quizGuess === actual) {
        resultEl.textContent = `✓ Spot on. RC was ${actual >= 0 ? '+' : ''}${actual}.`;
        resultEl.className = 'quiz-result correct';
      } else {
        resultEl.textContent = `✗ Actual RC was ${actual >= 0 ? '+' : ''}${actual}. You guessed ${quizGuess >= 0 ? '+' : ''}${quizGuess}.`;
        resultEl.className = 'quiz-result miss';
      }
      quizPhase = 'reveal';
      document.getElementById('quizSubmit').textContent = 'Continue';
    } else {
      document.getElementById('quizModal').classList.add('hidden');
      mode2HandsPlayed = 0;
      resetQuiz();
    }
  });

  document.getElementById('tutorialSkip').addEventListener('click', hideTutorial);
  document.getElementById('tutorialNext').addEventListener('click', () => {
    const lessons = activeTutorialLessons();
    if (tutorialIndex < lessons.length - 1) {
      tutorialIndex++;
      renderTutorial();
    } else {
      hideTutorial();
    }
  });

  document.getElementById('infoBtn').addEventListener('click', () => {
    if (currentMode === 1) showTutorial();
    else if (currentMode === 2) showCountTutorial();
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
        hideTutorial();
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
          // Mode 2 test affordances
          else if (action.startsWith('tut')) {
            const idx = parseInt(action.slice(3), 10);
            if (Number.isFinite(idx)) {
              tutorialIndex = idx;
              document.getElementById('tutorialModal').classList.remove('hidden');
              renderTutorial();
            }
          }
          else if (action === 'subVisible' || action === 'subHidden' || action === 'subBet') {
            const targetSub = action === 'subVisible' ? 'visible'
                            : action === 'subHidden' ? 'hidden' : 'bet-sizing';
            countSubMode = targetSub;
            document.querySelectorAll('.submode-btn').forEach(b => {
              b.classList.toggle('active', b.dataset.submode === targetSub);
            });
            applySubModeUI();
            resetShoeAndCount();
            clearBetReview();
            mode2HandsPlayed = 0;
          }
          else if (action.startsWith('m2chip')) {
            await onMode2ChipClick(action.slice(6));
          }
          await sleep(250);
        }
      }, 150);
    }
  }
})();
