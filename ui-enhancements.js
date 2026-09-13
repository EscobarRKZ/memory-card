(() => {
  const SORT_KEY = 'memory-card-games-sort-v1';
  const collator = new Intl.Collator('ru', { sensitivity: 'base', numeric: true });

  const platforms = [
    ['PSP', 'PSP'], ['VITA', 'Vita'], ['DSI', 'DSi'], ['3DS', '3DS'],
    ['GBA', 'GBA'], ['PS3', 'PS3'], ['WIIU', 'Wii U'], ['SWITCH', 'Switch'],
  ];

  const svg = {
    PSP: '<svg viewBox="0 0 72 44" aria-hidden="true"><rect x="4" y="8" width="64" height="28" rx="9"/><rect class="screen-cut" x="23" y="11" width="26" height="22" rx="2"/><circle class="screen-cut" cx="14" cy="22" r="4"/><circle class="screen-cut" cx="59" cy="19" r="2"/></svg>',
    VITA: '<svg viewBox="0 0 72 44" aria-hidden="true"><path d="M9 8h54c4 0 7 5 7 14s-3 14-7 14H9c-4 0-7-5-7-14S5 8 9 8Z"/><rect class="screen-cut" x="22" y="10" width="28" height="24" rx="2"/><circle class="screen-cut" cx="14" cy="22" r="4"/><circle class="screen-cut" cx="58" cy="22" r="4"/></svg>',
    DSI: '<svg viewBox="0 0 72 44" aria-hidden="true"><rect x="15" y="2" width="42" height="19" rx="3"/><rect x="15" y="23" width="42" height="19" rx="3"/><rect class="screen-cut" x="23" y="5" width="26" height="13" rx="1"/><rect class="screen-cut" x="23" y="26" width="26" height="13" rx="1"/></svg>',
    '3DS': '<svg viewBox="0 0 72 44" aria-hidden="true"><rect x="13" y="2" width="46" height="19" rx="4"/><rect x="13" y="23" width="46" height="19" rx="4"/><rect class="screen-cut" x="21" y="5" width="30" height="13" rx="1"/><rect class="screen-cut" x="23" y="26" width="26" height="13" rx="1"/></svg>',
    GBA: '<svg viewBox="0 0 72 44" aria-hidden="true"><path d="M9 4h54c4 0 7 4 7 9v22c0 4-3 7-7 7H9c-4 0-7-3-7-7V13c0-5 3-9 7-9Z"/><rect class="screen-cut" x="23" y="7" width="27" height="22" rx="2"/><circle class="screen-cut" cx="15" cy="24" r="4"/><circle class="screen-cut" cx="59" cy="21" r="2.5"/></svg>',
    PS3: '<svg viewBox="0 0 72 44" aria-hidden="true"><path d="M8 11c15-5 41-5 56 0v23H8Z"/><path class="screen-cut" d="M18 15c10-2 26-2 36 0v13H18Z"/></svg>',
    WIIU: '<svg viewBox="0 0 72 44" aria-hidden="true"><rect x="5" y="7" width="62" height="30" rx="8"/><rect class="screen-cut" x="22" y="10" width="28" height="22" rx="2"/><circle class="screen-cut" cx="14" cy="18" r="3"/><circle class="screen-cut" cx="58" cy="18" r="3"/></svg>',
    SWITCH: '<svg viewBox="0 0 72 44" aria-hidden="true"><rect x="18" y="6" width="36" height="32" rx="3"/><rect class="screen-cut" x="22" y="9" width="28" height="26" rx="1"/><path d="M9 5h9v34H9c-4 0-7-4-7-9V14c0-5 3-9 7-9ZM54 5h9c4 0 7 4 7 9v16c0 5-3 9-7 9h-9Z"/><circle class="screen-cut" cx="11" cy="16" r="3"/><circle class="screen-cut" cx="61" cy="28" r="3"/></svg>',
  };

  function readSort() {
    try { return localStorage.getItem(SORT_KEY) || 'default'; }
    catch (_) { return 'default'; }
  }

  function writeSort(value) {
    try { localStorage.setItem(SORT_KEY, value); } catch (_) {}
  }

  function upgradePlatformSelector(select) {
    if (!(select instanceof HTMLSelectElement) || select.dataset.buttonSelectorReady === '1') return;
    const field = select.closest('.field');
    if (!field) return;

    select.dataset.buttonSelectorReady = '1';
    field.classList.add('platform-choice-field');
    const grid = document.createElement('div');
    grid.className = 'platform-choice-grid';
    grid.setAttribute('role', 'radiogroup');
    grid.setAttribute('aria-label', 'Платформа');

    const updateSelected = () => {
      for (const button of grid.querySelectorAll('.platform-choice-button')) {
        const selected = button.dataset.platformChoice === select.value;
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-checked', selected ? 'true' : 'false');
      }
    };

    for (const [id, label] of platforms) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'platform-choice-button';
      button.dataset.platformChoice = id;
      button.setAttribute('role', 'radio');
      button.innerHTML = `<span class="platform-choice-icon">${svg[id]}</span><span class="platform-choice-name">${label}</span>`;
      button.addEventListener('click', event => {
        event.preventDefault();
        if (select.value === id) return;
        select.value = id;
        updateSelected();
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      grid.appendChild(button);
    }

    select.insertAdjacentElement('afterend', grid);
    select.addEventListener('change', updateSelected);
    updateSelected();
  }

  function rememberOriginalOrder(grid) {
    [...grid.querySelectorAll(':scope > .game-card')].forEach((card, index) => {
      if (!card.dataset.originalSortIndex) card.dataset.originalSortIndex = String(index + 1);
    });
  }

  function cardData(card) {
    const title = (card.querySelector('.game-body h3')?.textContent || '').trim();
    const ratingText = card.querySelector('.stars-chip')?.textContent || '';
    const ratingMatch = ratingText.match(/([0-9]+(?:[.,][0-9]+)?)/);
    const kicker = card.querySelector('.game-card-kicker')?.textContent || '';
    const years = kicker.match(/\b(?:19|20)\d{2}\b/g);
    return {
      card,
      title,
      rating: ratingMatch ? Number(ratingMatch[1].replace(',', '.')) : -1,
      year: years?.length ? Number(years[years.length - 1]) : 0,
      original: Number(card.dataset.originalSortIndex || 0),
    };
  }

  function compare(a, b, mode) {
    switch (mode) {
      case 'title-asc': return collator.compare(a.title, b.title);
      case 'title-desc': return collator.compare(b.title, a.title);
      case 'rating-desc': {
        if (a.rating < 0 && b.rating >= 0) return 1;
        if (b.rating < 0 && a.rating >= 0) return -1;
        return b.rating - a.rating || collator.compare(a.title, b.title);
      }
      case 'rating-asc': {
        if (a.rating < 0 && b.rating >= 0) return 1;
        if (b.rating < 0 && a.rating >= 0) return -1;
        return a.rating - b.rating || collator.compare(a.title, b.title);
      }
      case 'year-desc': {
        if (!a.year && b.year) return 1;
        if (!b.year && a.year) return -1;
        return b.year - a.year || collator.compare(a.title, b.title);
      }
      case 'year-asc': {
        if (!a.year && b.year) return 1;
        if (!b.year && a.year) return -1;
        return a.year - b.year || collator.compare(a.title, b.title);
      }
      default: return a.original - b.original;
    }
  }

  function applySort(grid, mode) {
    if (!(grid instanceof HTMLElement)) return;
    rememberOriginalOrder(grid);
    const cards = [...grid.querySelectorAll(':scope > .game-card')];
    grid.dataset.sortMode = mode;
    grid.dataset.sortReady = '1';
    if (cards.length < 2) return;

    const rows = cards.map(cardData).sort((a, b) => compare(a, b, mode));
    if (rows.every((row, i) => row.card === cards[i])) return;

    const fragment = document.createDocumentFragment();
    for (const row of rows) fragment.appendChild(row.card);
    grid.appendChild(fragment);
  }

  function ensureGamesSortControl() {
    const search = document.querySelector('#search');
    const toolbar = search?.closest('.toolbar');
    if (!toolbar) return null;

    const mode = readSort();
    let select = toolbar.querySelector('#gamesSort');
    if (!select) {
      const field = document.createElement('div');
      field.className = 'field games-sort-field';
      field.innerHTML = `<label for="gamesSort">Сортировка</label><select id="gamesSort">
        <option value="default">По добавлению</option>
        <option value="title-asc">Название: А → Я</option>
        <option value="title-desc">Название: Я → А</option>
        <option value="rating-desc">Оценка: выше → ниже</option>
        <option value="rating-asc">Оценка: ниже → выше</option>
        <option value="year-desc">Год выхода: новые → старые</option>
        <option value="year-asc">Год выхода: старые → новые</option>
      </select>`;
      toolbar.appendChild(field);
      select = field.querySelector('#gamesSort');
      select.addEventListener('change', () => {
        const next = select.value || 'default';
        writeSort(next);
        const currentGrid = document.querySelector('.game-grid');
        if (currentGrid) applySort(currentGrid, next);
      });
    }
    if (select && select.value !== mode) select.value = mode;
    return select;
  }

  function upgradeGamesSorting() {
    ensureGamesSortControl();
    const grid = document.querySelector('.game-grid');
    if (!grid) return;
    const mode = readSort();
    if (grid.dataset.sortReady !== '1' || grid.dataset.sortMode !== mode) applySort(grid, mode);
  }

  function enhance() {
    document.querySelectorAll('form select[data-game-platform]').forEach(upgradePlatformSelector);
    upgradeGamesSorting();
  }

  const app = document.querySelector('#app');
  let observer = null;
  let queued = false;

  function observe() {
    if (app && observer) observer.observe(app, { childList: true, subtree: true });
  }

  function runEnhance() {
    queued = false;
    observer?.disconnect();
    try { enhance(); }
    finally { observe(); }
  }

  function scheduleEnhance() {
    if (queued) return;
    queued = true;
    queueMicrotask(runEnhance);
  }

  if (app) {
    observer = new MutationObserver(scheduleEnhance);
    observe();
  }

  window.addEventListener('pageshow', scheduleEnhance);
  window.addEventListener('load', scheduleEnhance);
  scheduleEnhance();
})();
