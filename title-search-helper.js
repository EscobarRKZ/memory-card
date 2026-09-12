/* Memory Card search fix — title-only filtering, event-driven v3 */
(() => {
  let timer = 0;

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

    const grid = document.querySelector('.game-grid');
    if (!grid) return;

    const q = normalize(search.value);
    const cards = [...grid.querySelectorAll(':scope > .game-card')];
    let visible = 0;

    for (const card of cards) {
      const title = normalize(card.querySelector('.game-body h3')?.textContent || '');
      const matches = !q || title.includes(q);
      setHidden(card, !matches);
      if (matches) visible++;
    }

    const content = search.closest('.content') || document.querySelector('.content');
    const resultCaption = content?.querySelector(':scope > .section-head p');
    const caption = `${visible} записей в текущем фильтре`;
    if (resultCaption && resultCaption.textContent !== caption) resultCaption.textContent = caption;

    let empty = document.querySelector('.title-search-empty');
    if (q && visible === 0) {
      if (!empty) {
        empty = document.createElement('div');
        empty.className = 'empty title-search-empty';
        empty.textContent = 'Игры с таким названием не найдены.';
        grid.insertAdjacentElement('afterend', empty);
      }
      setHidden(grid, true);
    } else {
      setHidden(grid, false);
      empty?.remove();
    }
  }

  function scheduleApply(delay = 0) {
    clearTimeout(timer);
    timer = setTimeout(() => requestAnimationFrame(applyTitleOnlySearch), delay);
  }

  // No MutationObserver here: app.js already redraws the view. We only correct the
  // result after user actions that can trigger that redraw, avoiding observer loops.
  document.addEventListener('input', event => {
    if (event.target instanceof HTMLInputElement && event.target.id === 'search') scheduleApply();
  });
  document.addEventListener('change', event => {
    if (event.target instanceof HTMLElement && ['statusFilter', 'platformFilter', 'gamesSort'].includes(event.target.id)) scheduleApply();
  });
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.nav button, .mobile-nav button, [data-action="clear-platform"]')) scheduleApply(20);
  });
  window.addEventListener('load', () => scheduleApply(20));
  window.addEventListener('pageshow', () => scheduleApply(20));
})();
