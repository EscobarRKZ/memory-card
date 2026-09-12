/* Memory Card search fix — title-only filtering, freeze-safe v2 */
(() => {
  let frame = 0;

  const normalize = value => String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9а-яё]+/gi, ' ')
    .trim();

  function setHidden(el, value) {
    if (el && el.hidden !== value) el.hidden = value;
  }

  function applyTitleOnlySearch() {
    const search = document.querySelector('#search');
    if (!(search instanceof HTMLInputElement)) return;

    const q = normalize(search.value);
    const grid = document.querySelector('.game-grid');
    const existingEmpty = document.querySelector('.title-search-empty');
    if (!grid) {
      existingEmpty?.remove();
      return;
    }

    const cards = [...grid.querySelectorAll(':scope > .game-card')];
    let visible = 0;

    for (const card of cards) {
      const title = normalize(card.querySelector('.game-body h3')?.textContent || '');
      const matches = !q || title.includes(q);
      setHidden(card, !matches);
      if (matches) visible++;
    }

    // IMPORTANT: do not rewrite the same text on every MutationObserver pass.
    // Setting textContent creates another DOM mutation and previously caused an
    // endless observer -> textContent -> observer loop when opening "Игры".
    const content = search.closest('.content') || document.querySelector('.content');
    const resultCaption = content?.querySelector(':scope > .section-head p');
    const caption = `${visible} записей в текущем фильтре`;
    if (resultCaption && resultCaption.textContent !== caption) {
      resultCaption.textContent = caption;
    }

    if (q && visible === 0) {
      if (!existingEmpty) {
        const empty = document.createElement('div');
        empty.className = 'empty title-search-empty';
        empty.textContent = 'Игры с таким названием не найдены.';
        grid.insertAdjacentElement('afterend', empty);
      }
      setHidden(grid, true);
    } else {
      setHidden(grid, false);
      existingEmpty?.remove();
    }
  }

  function scheduleApply() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      applyTitleOnlySearch();
    });
  }

  // app.js redraws the Games view on navigation/filter/search changes. Observe only
  // the application root and batch reactions to one animation frame so helper DOM
  // work can never monopolise the main thread.
  const app = document.querySelector('#app');
  if (app) {
    new MutationObserver(scheduleApply).observe(app, { childList: true, subtree: true });
  }

  document.addEventListener('input', event => {
    if (event.target instanceof HTMLInputElement && event.target.id === 'search') scheduleApply();
  }, true);

  window.addEventListener('load', scheduleApply);
  scheduleApply();
})();
