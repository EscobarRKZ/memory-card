/* Memory Card search fix — title-only filtering */
(() => {
  let scheduled = false;

  const normalize = value => String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9а-яё]+/gi, ' ')
    .trim();

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

    const cards = [...grid.querySelectorAll('.game-card')];
    let visible = 0;

    for (const card of cards) {
      const title = normalize(card.querySelector('h3')?.textContent || '');
      const matches = !q || title.includes(q);
      card.hidden = !matches;
      if (matches) visible++;
    }

    // Keep the result counter consistent with what is actually visible.
    const content = search.closest('.content') || document.querySelector('.content');
    const resultCaption = content?.querySelector(':scope > .section-head p');
    if (resultCaption) resultCaption.textContent = `${visible} записей в текущем фильтре`;

    if (q && visible === 0) {
      if (!existingEmpty) {
        const empty = document.createElement('div');
        empty.className = 'empty title-search-empty';
        empty.textContent = 'Игры с таким названием не найдены.';
        grid.insertAdjacentElement('afterend', empty);
      }
      grid.hidden = true;
    } else {
      grid.hidden = false;
      existingEmpty?.remove();
    }
  }

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      applyTitleOnlySearch();
    });
  }

  // app.js redraws the Games view on every search keystroke, so apply the
  // title-only rule after every redraw instead of duplicating the app state.
  const observer = new MutationObserver(scheduleApply);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('input', event => {
    if (event.target instanceof HTMLInputElement && event.target.id === 'search') scheduleApply();
  }, true);

  window.addEventListener('load', scheduleApply);
})();
