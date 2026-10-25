/* v63 — lightweight library controls; preserves existing app and handlers. */
(() => {
  let advancedExpanded = false;
  let queued = false;

  const label = (ru, en) => state?.settings?.language === 'en' ? en : ru;

  function records() {
    return (state.games || []).filter(g => g && !g.deletedAt && g.status !== 'backlog'
      && (!state.platformFilter || g.platform === state.platformFilter));
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
      more.textContent = label('Фильтры и вид', 'Filters & layout');
      more.setAttribute('aria-expanded', advancedExpanded ? 'true' : 'false');
      more.setAttribute('aria-label', label('Показать дополнительные фильтры и настройки вида', 'Show additional filters and layout settings'));
      searchField?.insertAdjacentElement('afterend', more);
    }
    toolbar.classList.toggle('mc-filters-open', advancedExpanded);
    const filters = toolbar.querySelector('[data-mc-filters]');
    if (filters) filters.setAttribute('aria-expanded', advancedExpanded ? 'true' : 'false');

    if (!toolbar.parentElement?.querySelector(':scope > .mc-quick-status')) {
      const quick = document.createElement('div');
      quick.className = 'mc-quick-status';
      quick.setAttribute('role', 'group');
      quick.setAttribute('aria-label', label('Быстрый фильтр по статусу', 'Quick status filter'));
      toolbar.insertAdjacentElement('afterend', quick);
    }

    const quick = toolbar.parentElement?.querySelector(':scope > .mc-quick-status');
    if (quick) {
      const list = records();
      const statuses = [
        ['all',label('Все','All'),list.length],
        ['completed',label('Пройдено','Completed'),list.filter(g => g.status === 'completed').length],
        ['playing',label('Играю','Playing'),list.filter(g => g.status === 'playing').length],
        ['dropped',label('Брошено','Dropped'),list.filter(g => g.status === 'dropped').length]
      ];
      quick.innerHTML = statuses.map(([id, name, count]) =>
        `<button type="button" class="mc-status-pill ${state.statusFilter === id ? 'active' : ''}" data-mc-status="${id}" aria-pressed="${state.statusFilter === id ? 'true':'false'}"><span>${name}</span><b>${count}</b></button>`
      ).join('');
    }

    window.MemoryCardApplyLibrarySearch?.();
  }

  function scheduleEnhance() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      enhanceLibrary();
    });
  }

  // Attach after every view render; selectors and sorting controls are added
  // by older enhancements in earlier microtasks.
  const baseRender = render;
  render = function(...args) {
    const value = baseRender.apply(this, args);
    scheduleEnhance();
    return value;
  };

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const clear = target.closest('[data-mc-clear-search]');
    if (clear) {
      const search = document.querySelector('#search');
      if (!search) return;
      event.preventDefault();
      search.value = '';
      state.search = '';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      search.focus();
      return;
    }

    const expand = target.closest('[data-mc-filters]');
    if (expand) {
      event.preventDefault();
      advancedExpanded = !advancedExpanded;
      const toolbar = expand.closest('.toolbar');
      toolbar?.classList.toggle('mc-filters-open', advancedExpanded);
      expand.setAttribute('aria-expanded', advancedExpanded ? 'true' : 'false');
      return;
    }

    const status = target.closest('[data-mc-status]');
    if (status) {
      const select = document.querySelector('#statusFilter');
      if (!select || select.value === status.dataset.mcStatus) return;
      event.preventDefault();
      select.value = status.dataset.mcStatus;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key !== '/' || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
    const active = document.activeElement;
    if (active?.matches?.('input,textarea,select,[contenteditable="true"]')) return;
    const search = document.querySelector('#search');
    if (search) {
      event.preventDefault();
      search.focus();
    }
  });

  window.addEventListener('pageshow', scheduleEnhance);
  scheduleEnhance();
})();
