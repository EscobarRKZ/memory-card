/* Library controls: v63 layout, v69 removable filters and session-local return context. */
(() => {
  'use strict';
  let advancedExpanded = false, queued = false, summaryFrame = 0;
  let libraryContext = null, returning = null, restoreEpoch = 0;
  let contextOwner = String(state?.settings?.userId || '');
  const label = (ru, en) => state?.settings?.language === 'en' ? en : ru;
  const isLibrary = () => state.view === 'games' && !state.modal;
  const activeQuery = () => String(document.querySelector('#search')?.value ?? state.search ?? '');
  const closeIcon = '<svg class="mc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="m6 6 12 12M6 18 18 6"/></svg>';

  function records() {
    return (state.games || []).filter(g => g && !g.deletedAt && g.status !== 'backlog'
      && (!state.platformFilter || g.platform === state.platformFilter));
  }

  function focusControl(selector) {
    queueMicrotask(() => {
      if (!isLibrary() || document.querySelector('dialog[open]')) return;
      document.querySelector(selector)?.focus({preventScroll: true});
    });
  }

  function clearFilter(kind) {
    if (!isLibrary()) return;
    ++restoreEpoch;
    if (kind === 'search') {
      const input = document.querySelector('#search');
      if (!input) return;
      input.value = '';
      state.search = '';
      input.dispatchEvent(new Event('input', {bubbles: true}));
      // Explicit clearing keeps the current input and cursor; no library redraw.
      input.focus({preventScroll: true});
      return;
    }
    if (kind === 'platform') state.platformFilter = '';
    else if (kind === 'all') {
      state.platformFilter = '';
      state.statusFilter = 'all';
      state.search = '';
    } else return;
    render();
    // A removed filter must not leave keyboard focus on a detached button.
    // Focus a button, not an input, so reset does not summon the phone keyboard.
    focusControl('.mc-status-pill[aria-pressed="true"]');
  }

  function filterButton(kind, text, accessibleName) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mc-applied-filter';
    button.dataset.mcClearFilter = kind;
    button.setAttribute('aria-label', accessibleName);
    button.title = text;
    const name = document.createElement('span');
    name.className = 'mc-applied-filter-name';
    name.textContent = text; // Query and platform names are never HTML.
    button.appendChild(name);
    button.insertAdjacentHTML('beforeend', closeIcon);
    return button;
  }

  function updateSummary() {
    summaryFrame = 0;
    if (state.view !== 'games') return;
    const toolbar = document.querySelector('.toolbar');
    const quick = toolbar?.parentElement?.querySelector(':scope > .mc-quick-status');
    if (!toolbar || !quick) return;
    const query = activeQuery().trim();
    const pid = String(state.platformFilter || '');
    const count = Number(!!query) + Number(!!pid) + Number(!!state.statusFilter && state.statusFilter !== 'all');
    const filters = toolbar.querySelector('[data-mc-filters]');
    if (filters) {
      let badge = filters.querySelector('[data-mc-filter-count]');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'mc-filter-count';
        badge.dataset.mcFilterCount = '';
        badge.setAttribute('aria-hidden', 'true');
        filters.appendChild(badge);
      }
      badge.hidden = count === 0;
      if (badge.textContent !== String(count)) badge.textContent = String(count);
      filters.setAttribute('aria-label', label('Фильтры и вид', 'Filters & layout')
        + (count ? label(`, активно: ${count}`, `, ${count} active`) : ''));
    }

    let row = toolbar.parentElement.querySelector(':scope > .mc-applied-filters');
    if (!count) row?.remove();
    else {
      if (!row) {
        row = document.createElement('div');
        row.className = 'mc-applied-filters';
        row.setAttribute('role', 'group');
        quick.insertAdjacentElement('afterend', row);
      }
      row.setAttribute('aria-label', label('Активные фильтры', 'Active filters'));
      const signature = JSON.stringify([pid, query, state.statusFilter, state.settings?.language]);
      if (row.dataset.signature !== signature) {
        const items = [];
        if (pid) {
          const p = platform(pid);
          items.push(filterButton('platform', p.abbr || p.name || pid,
            label('Убрать фильтр платформы: ', 'Remove platform filter: ') + (p.name || pid)));
        }
        if (query) items.push(filterButton('search', label('Поиск: ', 'Search: ') + query,
          label('Очистить поиск: ', 'Clear search: ') + query));
        // Status is already visible in the selected quick pill; do not repeat it.
        const reset = document.createElement('button');
        reset.type = 'button';
        reset.className = 'mc-reset-filters';
        reset.dataset.mcClearFilter = 'all';
        reset.textContent = label('Сбросить', 'Reset');
        reset.setAttribute('aria-label', label('Сбросить поиск и фильтры', 'Reset search and filters'));
        items.push(reset);
        row.replaceChildren(...items);
        row.dataset.signature = signature;
      }
    }
    document.querySelectorAll('.content > .empty,.content > .title-search-empty').forEach(empty => {
      let reset = empty.querySelector('[data-mc-empty-reset]');
      if (!count) { reset?.remove(); return; }
      if (reset) return;
      reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'secondary mc-empty-reset';
      reset.dataset.mcEmptyReset = '';
      reset.dataset.mcClearFilter = 'all';
      reset.textContent = label('Показать все игры', 'Show all games');
      empty.appendChild(reset);
    });
  }

  function scheduleSummary() {
    if (!summaryFrame) summaryFrame = requestAnimationFrame(updateSummary);
  }

  function enhanceLibrary() {
    if (state.view !== 'games') return;
    const toolbar = document.querySelector('.toolbar');
    const search = toolbar?.querySelector('#search');
    if (!toolbar || !search) return;
    const searchField = search.closest('.field');
    if (searchField && !searchField.classList.contains('mc-search-field')) {
      searchField.classList.add('mc-search-field');
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'mc-search-clear';
      clear.dataset.mcClearSearch = '1';
      clear.setAttribute('aria-label', label('Очистить поиск', 'Clear search'));
      clear.title = label('Очистить поиск', 'Clear search');
      clear.textContent = '×';
      clear.hidden = !search.value;
      searchField.appendChild(clear);
    }
    if (!toolbar.querySelector('[data-mc-filters]')) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'mc-filter-toggle';
      more.dataset.mcFilters = '1';
      more.classList.add('mc-icon-button');
      more.innerHTML = '<svg class="mc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M4 6h16M7 12h10M10 18h4"/></svg>';
      const text = document.createElement('span');
      text.textContent = label('Фильтры и вид', 'Filters & layout');
      more.appendChild(text);
      searchField?.insertAdjacentElement('afterend', more);
    }
    toolbar.classList.toggle('mc-filters-open', advancedExpanded);
    toolbar.querySelector('[data-mc-filters]')?.setAttribute('aria-expanded', String(advancedExpanded));
    let quick = toolbar.parentElement?.querySelector(':scope > .mc-quick-status');
    if (!quick) {
      quick = document.createElement('div');
      quick.className = 'mc-quick-status';
      quick.setAttribute('role', 'group');
      toolbar.insertAdjacentElement('afterend', quick);
    }
    quick.setAttribute('aria-label', label('Быстрый фильтр по статусу', 'Quick status filter'));
    const list = records();
    const statuses = [
      ['all', label('Все', 'All'), list.length],
      ['completed', label('Пройдено', 'Completed'), list.filter(g => g.status === 'completed').length],
      ['playing', label('Играю', 'Playing'), list.filter(g => g.status === 'playing').length],
      ['dropped', label('Брошено', 'Dropped'), list.filter(g => g.status === 'dropped').length]
    ];
    const html = statuses.map(([id, name, count]) =>
      `<button type="button" class="mc-status-pill ${state.statusFilter === id ? 'active' : ''}" data-mc-status="${id}" aria-pressed="${state.statusFilter === id ? 'true' : 'false'}"><span>${name}</span><b>${count}</b></button>`).join('');
    // Repeated enhancement must not destroy a keyboard-focused shortcut.
    if (quick.innerHTML !== html) quick.innerHTML = html;
    window.MemoryCardApplyLibrarySearch?.();
    scheduleSummary();
  }

  function scheduleEnhance() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; enhanceLibrary(); });
  }

  function captureLibrary() {
    const search = document.querySelector('.content #search');
    if (!search || state.modal) return null;
    const top = document.querySelector('.topbar')?.getBoundingClientRect().bottom || 0;
    let anchor = null;
    for (const card of document.querySelectorAll('.game-grid .game-card:not([hidden])')) {
      const rect = card.getBoundingClientRect();
      if (rect.height > 0 && rect.bottom > top && rect.top < innerHeight) {
        anchor = {id: card.dataset.game, top: rect.top};
        break;
      }
    }
    return {
      owner: contextOwner,
      search: search.value,
      platformFilter: document.querySelector('#platformFilter')?.value || '',
      statusFilter: document.querySelector('#statusFilter')?.value || 'all',
      y: scrollY, anchor
    };
  }

  function restoreScroll(context) {
    const epoch = ++restoreEpoch;
    const allowed = () => epoch === restoreEpoch && isLibrary() && !document.querySelector('dialog[open]');
    const adjust = () => {
      if (!allowed() || !context.anchor) return;
      const card = [...document.querySelectorAll('.game-grid .game-card:not([hidden])')]
        .find(el => el.dataset.game === context.anchor.id);
      if (card) window.scrollBy({top: card.getBoundingClientRect().top - context.anchor.top, left: 0, behavior: 'auto'});
    };
    // Bounded restoration after search/sorting/layout enhancements. Never poll.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!allowed()) return;
      window.scrollTo({top: Math.max(0, context.y), left: 0, behavior: 'auto'});
      adjust();
      requestAnimationFrame(adjust);
    }));
  }

  const baseRender = render;
  render = function(...args) {
    const owner = String(state?.settings?.userId || '');
    if (owner !== contextOwner) { contextOwner = owner; libraryContext = null; returning = null; ++restoreEpoch; }
    // Capture the outgoing DOM before an explicit detail/card route replaces it.
    // Reads native select values because navigate() may already have reset state.
    if (state.view !== 'games') {
      const captured = captureLibrary();
      if (captured) libraryContext = captured;
    }
    const context = returning && state.view === 'games' && !state.modal ? returning : null;
    returning = null;
    if (context) {
      state.search = context.search;
      state.platformFilter = PLATFORMS.some(p => p.id === context.platformFilter) ? context.platformFilter : '';
      state.statusFilter = ['all','completed','playing','dropped','backlog'].includes(context.statusFilter) ? context.statusFilter : 'all';
    }
    const value = baseRender.apply(this, args);
    scheduleEnhance();
    if (context) restoreScroll(context);
    return value;
  };

  const baseNavigate = navigate;
  navigate = function(view, ...args) {
    ++restoreEpoch;
    if (state.view === 'games') {
      const captured = captureLibrary();
      if (captured) libraryContext = captured;
    }
    returning = view === 'games' && state.view !== 'games' && !state.modal
      && libraryContext?.owner === String(state?.settings?.userId || '') ? libraryContext : null;
    try { return baseNavigate.call(this, view, ...args); }
    finally { returning = null; }
  };

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const clear = target.closest('[data-mc-clear-search],[data-mc-clear-filter]');
    if (clear) { event.preventDefault(); clearFilter(clear.dataset.mcClearFilter || 'search'); return; }
    const expand = target.closest('[data-mc-filters]');
    if (expand) {
      event.preventDefault(); advancedExpanded = !advancedExpanded;
      expand.closest('.toolbar')?.classList.toggle('mc-filters-open', advancedExpanded);
      expand.setAttribute('aria-expanded', String(advancedExpanded));
      return;
    }
    const status = target.closest('[data-mc-status]');
    if (status) {
      const select = document.querySelector('#statusFilter');
      if (!select || select.value === status.dataset.mcStatus) return;
      event.preventDefault(); ++restoreEpoch;
      select.value = status.dataset.mcStatus;
      select.dispatchEvent(new Event('change', {bubbles: true}));
      focusControl(`.mc-status-pill[data-mc-status="${select.value}"]`);
    }
  });
  document.addEventListener('input', event => {
    if (event.target?.id === 'search') { ++restoreEpoch; scheduleSummary(); }
  });
  document.addEventListener('change', event => {
    if (['statusFilter','platformFilter','gamesSort','gamesView'].includes(event.target?.id)) { ++restoreEpoch; scheduleSummary(); }
  });
  document.addEventListener('keydown', event => {
    ++restoreEpoch;
    if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
    const active = document.activeElement;
    if (event.key === 'Escape' && isLibrary() && active?.id === 'search' && active.value) {
      event.preventDefault(); clearFilter('search'); return;
    }
    if (event.key !== '/' || active?.matches?.('input,textarea,select,[contenteditable="true"]')) return;
    const search = isLibrary() ? document.querySelector('#search') : null;
    if (search) { event.preventDefault(); search.focus(); }
  });
  // User input cancels a scheduled return-scroll instead of fighting the gesture.
  ['wheel','touchstart','pointerdown'].forEach(type => document.addEventListener(type, () => { ++restoreEpoch; }, {passive: true, capture: true}));
  document.addEventListener('mc:experience-ready', scheduleEnhance);
  window.addEventListener('pageshow', scheduleEnhance);
  scheduleEnhance();
})();
