(() => {
  const MODE_NAMES = {
    1: 'Learn to Play',
    2: 'Learn to Count',
    3: 'Test Yourself',
  };

  const homeEl = document.getElementById('screen-home');
  const gameEl = document.getElementById('screen-game');
  const gameTitleEl = document.getElementById('game-title');
  const backBtn = document.getElementById('back-btn');

  let current = 'home';

  function show(screen, mode) {
    current = screen;
    if (screen === 'home') {
      homeEl.classList.remove('hidden');
      gameEl.classList.add('hidden');
    } else {
      gameTitleEl.textContent = MODE_NAMES[mode] || '';
      homeEl.classList.add('hidden');
      gameEl.classList.remove('hidden');
    }
  }

  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = Number(btn.dataset.mode);
      show(`mode-${mode}`, mode);
    });
  });

  backBtn.addEventListener('click', () => show('home'));
})();
