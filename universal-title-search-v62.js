/* v62: on-demand game title autocomplete for consoles without a bulk catalogue.
   Does not claim a suggested title is released on the selected platform. */
(() => {
  const MIN_REMOTE = 3;
  const MAX_LOCAL = 6;
  const FRESH_MS = 20 * 60 * 1000;
  const cache = new Map();
  const inflight = new Map();
  const timers = new WeakMap();
  let syntheticInput = false;
  let saveTimer = 0;

  const clean = value => String(value || '').trim().replace(/\s+/g, ' ');
  const keyFor = value => clean(value).toLocaleLowerCase();
  const isCyrillic = value => /[а-яё]/i.test(value);

  function gameEntity(entry) {
    const desc = String(entry?.description || '');
    const isGame = /video[ -]?games?|videogames?|computer games?|(?:action|adventure|sports|racing|shooter|sandbox|multiplayer|rhythm|stealth|survival|fantasy|fighting|arcade|platform|puzzle|role.playing|horror|strategy|simulation|indie|roguelike|online|open.world|first.person|third.person)(?:[ -][\\w-]+){0,3}[ -]games?|\\b(?:19|20)\\d{2}[ -]games?\\b|видеоигр|компьютерн.{0,5} игр|аркадн.{0,5} игр/i.test(desc);
    const series = /video game series|series of video games|video game franchise|fictional character|видеоигр.*сери|серия видеоигр|игровая франшиза|персонаж/i.test(desc);
    return isGame && !series && String(entry?.label || '').trim().length > 1;
  }

  async function queryWikidata(q) {
    const params = new URLSearchParams({
      action: 'wbsearchentities',
      format: 'json',
      origin: '*',
      type: 'item',
      language: isCyrillic(q) ? 'ru' : 'en',
      uselang: isCyrillic(q) ? 'ru' : 'en',
      search: q,
      limit: '30'
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8500);
    try {
      const response = await fetch('https://www.wikidata.org/w/api.php?' + params, {
        signal: controller.signal,
        credentials: 'omit'
      });
      if (!response.ok) throw new Error('Wikidata HTTP ' + response.status);
      const data = await response.json();
      const unique = new Set();
      return (Array.isArray(data?.search) ? data.search : [])
        .filter(gameEntity)
        .filter(entry => {
          const title = clean(entry.label).toLocaleLowerCase();
          if (unique.has(title)) return false;
          unique.add(title);
          return true;
        })
        .slice(0, 12)
        .map(entry => {
          const desc = clean(entry.description);
          const year = desc.match(/^(?:.*?\b)?((?:19|20)\d{2})\s+(?:(?:\S+\s+){0,4})(?:video|computer|arcade|platform|puzzle|role.playing|horror|strategy|simulation|indie|видеоигр|компьютерн)/i);
          return {
            id: String(entry.id || ''),
            title: clean(entry.label),
            releaseYear: year ? year[1] : ''
          };
        });
    } finally {
      clearTimeout(timeout);
    }
  }

  function lookup(q) {
    const key = keyFor(q);
    const saved = cache.get(key);
    if (saved && Date.now() - saved.time < FRESH_MS) return Promise.resolve(saved);
    if (inflight.has(key)) return inflight.get(key);
    const task = queryWikidata(q)
      .then(rows => {
        const value = { rows, time: Date.now(), error: false };
        cache.set(key, value);
        return value;
      })
      .catch(error => {
        console.warn('Memory Card live title search unavailable', error);
        const value = { rows: [], time: Date.now() - FRESH_MS + 60000, error: true };
        cache.set(key, value);
        return value;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, task);
    return task;
  }

  function persistNewTitles() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (typeof persistCatalog === 'function') {
        Promise.resolve(persistCatalog()).catch(error => console.warn('Title cache save', error));
      }
    }, 1600);
  }

  function mergeTitles(platformId, rows) {
    if (!rows?.length || typeof mergeCatalog !== 'function') return;
    const old = new Set((state.catalog || [])
      .filter(item => item.platform === platformId)
      .map(item => keyFor(item.title)));
    const fresh = rows
      .filter(item => !old.has(keyFor(item.title)))
      .map(item => ({
        key: 'wd-live-' + platformId + '-' + item.id,
        platform: platformId,
        title: item.title,
        releaseYear: item.releaseYear || '',
        genre: '',
        franchise: '',
        coverUrl: '',
        source: 'wikidata-live'
      }));
    if (fresh.length) {
      mergeCatalog(fresh);
      persistNewTitles();
    }
  }

  function currentPlatform(input, mode) {
    if (mode === 'modal') return input.closest('form')?.querySelector('[data-game-platform]')?.value || '';
    if (mode === 'backlog-v17') return input.closest('form')?.querySelector('[data-v17-backlog-platform]')?.value || '';
    return document.querySelector('[data-v23-add-platform].active')?.dataset.v23AddPlatform || '';
  }

  function note(input, mode, message) {
    if (mode === 'modal') {
      const list = input.closest('form')?.querySelector('[data-autocomplete-list]');
      if (!list || typeof catalogSearch !== 'function') return;
      if (catalogSearch(currentPlatform(input, mode), input.value).length) return;
      list.hidden = false;
      list.innerHTML = '<div class="mc-live-search-status" role="status">' + message + '</div>';
    } else if (mode === 'backlog-v23') {
      const field = input.closest('.v23-title-field');
      if (!field) return;
      let label = field.querySelector('[data-mc-live-status]');
      if (!label) {
        label = document.createElement('div');
        label.className = 'mc-live-search-status';
        label.dataset.mcLiveStatus = '1';
        field.appendChild(label);
      }
      label.textContent = message;
    } else if (mode === 'backlog-v17') {
      const form = input.closest('form');
      const box = form?.querySelector('[data-v17-backlog-suggestions]');
      if (!box || typeof catalogSearch !== 'function') return;
      if (catalogSearch(currentPlatform(input, mode), input.value).length) return;
      box.hidden = false;
      box.innerHTML = '<div class="mc-live-search-status" role="status">' + message + '</div>';
    }
  }

  function removeNote(input, mode) {
    if (mode === 'backlog-v23') input.closest('.v23-title-field')?.querySelector('[data-mc-live-status]')?.remove();
  }

  function refresh(input, mode, platformId, query, result) {
    if (!input.isConnected || keyFor(input.value) !== keyFor(query) || currentPlatform(input, mode) !== platformId) return;
    removeNote(input, mode);
    if (mode === 'modal') {
      if (typeof baseShowAutocomplete === 'function') baseShowAutocomplete(input, platformId);
      if (!catalogSearch(platformId, input.value).length) {
        note(input, mode, result.error ? 'Поиск временно недоступен — название можно ввести вручную.' : 'Не найдено. Название можно ввести вручную.');
      }
    } else {
      syntheticInput = true;
      try { input.dispatchEvent(new Event('input', { bubbles: true })); }
      finally { syntheticInput = false; }
      if (!catalogSearch(platformId, input.value).length) {
        note(input, mode, result.error ? 'Поиск временно недоступен — название можно ввести вручную.' : 'Ничего не найдено — можно ввести название вручную.');
      }
    }
  }

  function schedule(input, platformId, mode) {
    if (!input || !platformId) return;
    const query = clean(input.value);
    const previous = timers.get(input);
    if (previous) clearTimeout(previous);
    removeNote(input, mode);
    if (query.length < MIN_REMOTE) return;
    if (typeof catalogSearch === 'function' && catalogSearch(platformId, query).length >= MAX_LOCAL) return;
    const key = keyFor(query);
    const cached = cache.get(key);
    if (cached && Date.now() - cached.time < FRESH_MS) {
      mergeTitles(platformId, cached.rows);
      refresh(input, mode, platformId, query, cached);
      return;
    }
    const timer = setTimeout(async () => {
      if (!input.isConnected || currentPlatform(input, mode) !== platformId || keyFor(input.value) !== key) return;
      note(input, mode, 'Ищу игры в онлайн-каталоге…');
      const result = await lookup(query);
      mergeTitles(platformId, result.rows);
      refresh(input, mode, platformId, query, result);
    }, 350);
    timers.set(input, timer);
  }

  // Modal searches already flow through this function on desktop and mobile.
  const baseShowAutocomplete = typeof showAutocomplete === 'function' ? showAutocomplete : null;
  if (baseShowAutocomplete) {
    showAutocomplete = function(input, platformId) {
      const output = baseShowAutocomplete.apply(this, arguments);
      schedule(input, platformId, 'modal');
      return output;
    };
  }

  document.addEventListener('input', event => {
    if (syntheticInput || !(event.target instanceof Element)) return;
    const input = event.target;
    if (input.matches('[data-v23-title]')) schedule(input, currentPlatform(input, 'backlog-v23'), 'backlog-v23');
    if (input.matches('[data-v17-backlog-title]')) schedule(input, currentPlatform(input, 'backlog-v17'), 'backlog-v17');
  });

  document.addEventListener('focusin', event => {
    const input = event.target;
    if (!(input instanceof Element)) return;
    if (input.matches('[data-v23-title]')) schedule(input, currentPlatform(input, 'backlog-v23'), 'backlog-v23');
    if (input.matches('[data-v17-backlog-title]')) schedule(input, currentPlatform(input, 'backlog-v17'), 'backlog-v17');
  });

  document.addEventListener('change', event => {
    if (event.target instanceof Element && event.target.matches('[data-v17-backlog-platform]')) {
      const input = event.target.closest('form')?.querySelector('[data-v17-backlog-title]');
      if (input) schedule(input, event.target.value, 'backlog-v17');
    }
  });

  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    if (!event.target.closest('[data-v23-add-platform],[data-v23-filter]')) return;
    setTimeout(() => {
      const input = document.querySelector('[data-v23-title]');
      if (input) schedule(input, currentPlatform(input, 'backlog-v23'), 'backlog-v23');
    }, 0);
  });

  window.MemoryCardLiveTitleSearch = { lookup };
})();
