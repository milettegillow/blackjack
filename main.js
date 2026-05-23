(() => {
  const MODE_NAMES = {
    1: 'Learn to Play',
    2: 'Learn to Count',
    3: 'Test Yourself',
  };

  const home = document.getElementById('screen-home');
  const game = document.getElementById('gameScreen');
  const topMode = document.getElementById('topMode');
  const backBtn = document.getElementById('backBtn');
  const countPanel = document.getElementById('countPanel');
  const deckIndicator = document.getElementById('deckIndicator');
  const moneyRow = document.getElementById('moneyRow');
  const chipRackM2 = document.getElementById('chipRackM2');
  const chipRackM3 = document.getElementById('chipRackM3');

  function showHome() {
    home.classList.remove('hidden');
    game.classList.add('hidden');
    countPanel.classList.add('hidden');
    deckIndicator.classList.add('hidden');
    moneyRow.classList.add('hidden');
    chipRackM2.classList.add('hidden');
    chipRackM3.classList.add('hidden');
  }

  function showGame(mode) {
    topMode.textContent = MODE_NAMES[mode] || '';
    countPanel.classList.toggle('hidden', mode !== 2);
    deckIndicator.classList.toggle('hidden', mode === 1);
    moneyRow.classList.toggle('hidden', mode !== 3);
    chipRackM2.classList.toggle('hidden', mode !== 2);
    chipRackM3.classList.toggle('hidden', mode !== 3);
    home.classList.add('hidden');
    game.classList.remove('hidden');
  }

  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => showGame(Number(btn.dataset.mode)));
  });

  backBtn.addEventListener('click', showHome);

  const hash = location.hash.match(/^#mode-([123])$/);
  if (hash) showGame(Number(hash[1]));
})();
