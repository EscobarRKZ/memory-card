(() => {
  function refreshGameSearch(input) {
    if (typeof state === 'undefined' || typeof filteredGames !== 'function' || typeof gameCard !== 'function') return;

    state.search = input.value;

    const toolbar = input.closest('.toolbar');
    const content = input.closest('main.content') || document.querySelector('main.content');
    if (!toolbar || !content || !content.contains(toolbar)) return;

    const games = filteredGames();
    const sectionHead = toolbar.previousElementSibling;
    const count = sectionHead?.classList?.contains('section-head') ? sectionHead.querySelector('p') : null;
    if (count) count.textContent = `${games.length} записей в текущем фильтре`;

    const currentResults = toolbar.nextElementSibling;
    if (!currentResults || !currentResults.matches('.game-grid, .empty')) return;

    const holder = document.createElement('div');
    holder.innerHTML = games.length
      ? `<div class="game-grid">${games.map(gameCard).join('')}</div>`
      : '<div class="empty">Ничего не найдено.</div>';

    const nextResults = holder.firstElementChild;
    if (!nextResults) return;
    currentResults.replaceWith(nextResults);

    // Newly rendered cards need the same click handlers as a normal app render.
    // bind() does not redraw the page; the capture listener below still prevents
    // the legacy search oninput handler from replacing the focused input.
    if (typeof bind === 'function') bind();
  }

  document.addEventListener('input', event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.id !== 'search') return;

    // app.js used to call render() on every character. That destroys and recreates
    // the focused input, which breaks mobile virtual keyboards/IME composition.
    // Stop that legacy handler and update only the search results instead.
    event.stopImmediatePropagation();
    refreshGameSearch(input);
  }, true);
})();
