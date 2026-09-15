(() => {
  const mobile = window.matchMedia('(max-width: 900px)');

  function installMobileInputCss() {
    if (document.querySelector('#mc-mobile-input-stability')) return;
    const style = document.createElement('style');
    style.id = 'mc-mobile-input-stability';
    style.textContent = `@media (max-width:900px){input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),select,textarea{font-size:16px!important}}`;
    document.head.appendChild(style);
  }

  function stabilizeSearchInput() {
    if (!mobile.matches) return;
    const search = document.querySelector('#search');
    if (!(search instanceof HTMLInputElement)) return;

    // app.js historically redraws the whole application from search.oninput.
    // On a phone that destroys the focused element while the virtual keyboard
    // is composing text. Keep the same input node alive and let the lightweight
    // title-search-helper hide/show existing cards instead.
    search.oninput = null;

    if (search.dataset.mcStableSearch === '1') return;
    search.dataset.mcStableSearch = '1';
    search.addEventListener('input', () => {
      if (typeof state !== 'undefined') state.search = search.value;
    });
  }

  if (typeof bind === 'function') {
    const baseBind = bind;
    bind = function(...args) {
      const result = baseBind.apply(this, args);
      stabilizeSearchInput();
      return result;
    };
  }

  // catalogSearch used to normalize and scan the full catalog on every single
  // character. Large catalogs can block the mobile main thread long enough to
  // make the keyboard look frozen. Build a cheap per-platform normalized index
  // and do not search until two characters have been entered.
  if (typeof catalogSearch === 'function' && typeof normalizeText === 'function') {
    let indexedCatalog = null;
    let indexedLength = -1;
    let platformIndex = new Map();

    function ensureCatalogIndex() {
      const catalog = Array.isArray(state?.catalog) ? state.catalog : [];
      if (indexedCatalog === catalog && indexedLength === catalog.length) return;
      indexedCatalog = catalog;
      indexedLength = catalog.length;
      platformIndex = new Map();
      for (const entry of catalog) {
        if (!entry?.platform || !entry?.title) continue;
        if (!platformIndex.has(entry.platform)) platformIndex.set(entry.platform, []);
        platformIndex.get(entry.platform).push({ entry, title: normalizeText(entry.title) });
      }
    }

    catalogSearch = function(platformId, query) {
      const q = normalizeText(query);
      if (!q || q.length < 2) return [];
      ensureCatalogIndex();
      const matches = [];
      for (const row of platformIndex.get(platformId) || []) {
        const at = row.title.indexOf(q);
        if (at < 0) continue;
        const rank = row.title === q ? 0 : row.title.startsWith(q) ? 1 : at + 10;
        matches.push({ ...row.entry, rank });
      }
      return matches
        .sort((a, b) => a.rank - b.rank || a.title.length - b.title.length || a.title.localeCompare(b.title))
        .slice(0, 8);
    };
  }

  if (typeof bindAutocomplete === 'function') {
    const baseBindAutocomplete = bindAutocomplete;
    bindAutocomplete = function(...args) {
      const result = baseBindAutocomplete.apply(this, args);
      if (!mobile.matches) return result;

      const form = typeof activeForm === 'function' ? activeForm() : null;
      const title = form?.querySelector?.('[data-game-title]');
      const platformSelect = form?.querySelector?.('[data-game-platform]');
      if (!(title instanceof HTMLInputElement) || !(platformSelect instanceof HTMLSelectElement)) return result;

      let timer = 0;
      const hide = () => {
        clearTimeout(timer);
        if (typeof hideAutocomplete === 'function') hideAutocomplete(form);
      };
      const run = () => {
        clearTimeout(timer);
        if (!title.isConnected || title.value.trim().length < 2) {
          hide();
          return;
        }
        if (typeof showAutocomplete === 'function') showAutocomplete(title, platformSelect.value);
      };

      title.oninput = event => {
        clearTimeout(timer);
        if (event?.isComposing || title.value.trim().length < 2) {
          hide();
          return;
        }
        timer = window.setTimeout(run, 160);
      };
      title.oncompositionstart = hide;
      title.oncompositionend = () => {
        clearTimeout(timer);
        timer = window.setTimeout(run, 0);
      };
      title.onfocus = () => {
        if (title.value.trim().length >= 2) timer = window.setTimeout(run, 80);
      };

      return result;
    };
  }

  installMobileInputCss();
  stabilizeSearchInput();
  if (mobile.matches && typeof bindAutocomplete === 'function') bindAutocomplete();

  window.addEventListener('pageshow', stabilizeSearchInput);
  mobile.addEventListener?.('change', () => {
    installMobileInputCss();
    stabilizeSearchInput();
  });
})();
