/* In-place library title search. No whole-app renders during typing. */
(() => {
  let frame = 0;
  const titleCache = new WeakMap();
  const normalize = value => String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9а-яё]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  function titleFor(card) {
    if (titleCache.has(card)) return titleCache.get(card);
    const title = normalize(card.querySelector('.game-body h3')?.textContent || '');
    titleCache.set(card, title);
    return title;
  }

  function setHidden(element, hidden) {
    if (element && element.hidden !== hidden) element.hidden = hidden;
  }

  function apply() {
    frame = 0;
    if (state?.view !== 'games') return;
    const search = document.querySelector('#search');
    if (!(search instanceof HTMLInputElement)) return;
    // The library can render an empty state instead of a grid for zero items.
    document.querySelectorAll('[data-mc-clear-search]').forEach(button => {
      button.hidden = !search.value;
    });
    const grid = document.querySelector('.game-grid');
    if (!grid) return;

    const query = normalize(search.value);
    const cards = grid.querySelectorAll(':scope > .game-card');
    let visible = 0;
    for (const card of cards) {
      const matches = !query || titleFor(card).includes(query);
      setHidden(card, !matches);
      if (matches) visible++;
    }

    const caption = search.closest('.content')?.querySelector(':scope > .section-head p');
    const label = state?.settings?.language === 'en' ? `Games found: ${visible}` : `Найдено игр: ${visible}`;
    if (caption && caption.textContent !== label) caption.textContent = label;

    let empty = document.querySelector('.title-search-empty');
    if (query && visible === 0) {
      if (!empty) {
        empty = document.createElement('div');
        empty.className = 'empty title-search-empty';
        empty.textContent = state?.settings?.language === 'en'
          ? 'No matching titles. Try another name or clear the search.'
          : 'Совпадений нет. Попробуй другое название или сбрось поиск.';
        grid.insertAdjacentElement('afterend', empty);
      }
      setHidden(grid, true);
    } else {
      setHidden(grid, false);
      empty?.remove();
    }

    document.querySelectorAll('[data-mc-clear-search]').forEach(button => {
      button.hidden = !search.value;
    });
  }

  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(apply);
  }

  window.MemoryCardApplyLibrarySearch = schedule;

  document.addEventListener('input', event => {
    if (event.target instanceof HTMLInputElement && event.target.id === 'search') {
      state.search = event.target.value;
      schedule();
    }
  });
  document.addEventListener('change', event => {
    if (event.target instanceof HTMLElement && ['statusFilter','platformFilter','gamesSort','gamesView'].includes(event.target.id)) schedule();
  });
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.nav button, .mobile-nav button, [data-action="clear-platform"]')) schedule();
  });
  window.addEventListener('load', schedule);
  window.addEventListener('pageshow', schedule);
})();
