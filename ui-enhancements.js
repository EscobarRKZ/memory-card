/* Memory Card UI enhancements — v0.16
   1) Platform selection uses icon buttons instead of a native dropdown.
   2) Games view gets title/rating/release-year sorting.
*/
(() => {
  const SORT_KEY = 'memory-card-games-sort-v1';
  let scheduled = false;

  const platforms = [
    ['PSP', 'PSP'],
    ['VITA', 'Vita'],
    ['DSI', 'DSi'],
    ['3DS', '3DS'],
    ['GBA', 'GBA'],
    ['PS3', 'PS3'],
    ['WIIU', 'Wii U'],
    ['SWITCH', 'Switch'],
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
      grid.querySelectorAll('.platform-choice-button').forEach(button => {
        const selected = button.dataset.platformChoice === select.value;
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-checked', selected ? 'true' : 'false');
      });
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
        // Keep app.js as the source of truth: its existing change handler refreshes
        // the title catalogue without re-rendering or clearing the rest of the form.
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      grid.appendChild(button);
    }

    select.insertAdjacentElement('afterend', grid);
    select.addEventListener('change', updateSelected);
    updateSelected();
  }

  function readSort() {
    try { return localStorage.getItem(SORT_KEY) || 'default'; }
    catch (_) { return 'default'; }
  }

  function writeSort(value) {
    try { localStorage.setItem(SORT_KEY, value); } catch (_) {}
  }

  const titleOf = card => (card.querySelector('.game-body h3')?.textContent || '').trim();
  const ratingOf = card => {
    const text = card.querySelector('.stars-chip')?.textContent || '';
    const m = text.match(/([0-9]+(?:[.,][0-9]+)?)/);
    return m ? Number(m[1].replace(',', '.')) : -1;
  };
  const yearOf = card => {
    const text = card.querySelector('.game-card-kicker')?.textContent || '';
    const years = text.match(/\b(?:19|20)\d{2}\b/g);
    return years?.length ? Number(years[years.length - 1]) : 0;
  };

  function compareCards(a, b, mode) {
    const collator = new Intl.Collator('ru', { sensitivity: 'base', numeric: true });
    switch (mode) {
      case 'title-asc': return collator.compare(titleOf(a), titleOf(b));
      case 'title-desc': return collator.compare(titleOf(b), titleOf(a));
      case 'rating-desc': return ratingOf(b) - ratingOf(a) || collator.compare(titleOf(a), titleOf(b));
      case 'rating-asc': {
        const ar = ratingOf(a), br = ratingOf(b);
        // Unrated games stay at the end in either rating mode.
        if (ar < 0 && br >= 0) return 1;
        if (br < 0 && ar >= 0) return -1;
        return ar - br || collator.compare(titleOf(a), titleOf(b));
      }
      case 'year-desc': return yearOf(b) - yearOf(a) || collator.compare(titleOf(a), titleOf(b));
      case 'year-asc': {
        const ay = yearOf(a), by = yearOf(b);
        if (!ay && by) return 1;
        if (!by && ay) return -1;
        return ay - by || collator.compare(titleOf(a), titleOf(b));
      }
      default: return Number(a.dataset.originalSortIndex || 0) - Number(b.dataset.originalSortIndex || 0);
    }
  }

  function applySort(grid, mode) {
    const cards = [...grid.querySelectorAll(':scope > .game-card')];
    cards.forEach((card, index) => {
      if (card.dataset.originalSortIndex == null) card.dataset.originalSortIndex = String(index);
    });
    const sorted = [...cards].sort((a, b) => compareCards(a, b, mode));
    const changed = sorted.some((card, index) => card !== cards[index]);
    if (!changed) return;
    const fragment = document.createDocumentFragment();
    sorted.forEach(card => fragment.appendChild(card));
    grid.appendChild(fragment);
  }

  function upgradeGamesSorting() {
    const grid = document.querySelector('.game-grid');
    const search = document.querySelector('#search');
    const toolbar = search?.closest('.toolbar');
    if (!grid || !toolbar) return;

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
      select.value = readSort();
      select.addEventListener('change', () => {
        writeSort(select.value);
        const currentGrid = document.querySelector('.game-grid');
        if (currentGrid) applySort(currentGrid, select.value);
      });
    } else {
      select.value = readSort();
    }

    applySort(grid, select.value || 'default');
  }

  function enhance() {
    document.querySelectorAll('form select[data-game-platform]').forEach(upgradePlatformSelector);
    upgradeGamesSorting();
  }

  function scheduleEnhance() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enhance();
    });
  }

  new MutationObserver(scheduleEnhance).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('load', scheduleEnhance);
  scheduleEnhance();
})();
