/* Memory Card catalog refresh helper — v0.20
   Replaces the fragile all-platform refresh button with a cache-safe updater.
   Existing local catalog entries are never deleted when a remote source fails.
*/
(() => {
  const DB_NAME = 'memory-card-db';
  const STORE = 'state';
  const CATALOG_KEY = 'catalog-v1';
  const SQL_BASE = 'https://raw.githubusercontent.com/bocaletto-luca/Videogames-Database/main/';
  const SQL_FILES = {
    PSP: 'psp.sql',
    VITA: 'psv.sql',
    DSI: 'ds.sql',
    '3DS': '3ds.sql',
    GBA: 'gba.sql',
    PS3: 'ps3.sql',
    WIIU: 'wiiu.sql',
  };
  const PLATFORM_NAMES = {
    PSP: 'PSP', VITA: 'PS Vita', DSI: 'DS / DSi', '3DS': '3DS',
    GBA: 'GBA', PS3: 'PS3', WIIU: 'Wii U', SWITCH: 'Switch',
  };
  const ORDER = ['PSP', 'VITA', 'DSI', '3DS', 'GBA', 'PS3', 'WIIU', 'SWITCH'];
  let running = false;

  const normalize = value => String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9а-яё]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const keyOf = entry => `${entry.platform}|${normalize(entry.title)}`;

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB недоступен'));
    });
  }

  async function readCatalog() {
    const db = await openDb();
    try {
      return await new Promise(resolve => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(CATALOG_KEY);
        req.onsuccess = () => resolve(req.result || { catalog: [], catalogMeta: {} });
        req.onerror = () => resolve({ catalog: [], catalogMeta: {} });
      });
    } finally { db.close(); }
  }

  async function writeCatalog(value) {
    const db = await openDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, CATALOG_KEY);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('Не удалось сохранить каталог'));
        tx.onabort = () => reject(tx.error || new Error('Сохранение каталога прервано'));
      });
    } finally { db.close(); }
  }

  async function fetchText(url, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } finally { clearTimeout(timer); }
  }

  function unescapeSql(value = '') {
    return String(value)
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }

  function parseSql(platform, text) {
    const out = [];
    // Dataset schema: id, game_name, genre_name, publisher_name, release_year, platform_name.
    // Match row-by-row and tolerate NULL fields and escaped apostrophes.
    const row = /\(\s*\d+\s*,\s*'((?:\\.|[^'])*)'\s*,\s*(?:'((?:\\.|[^'])*)'|NULL)\s*,\s*(?:'((?:\\.|[^'])*)'|NULL)\s*,\s*(NULL|\d+)\s*,\s*(?:'((?:\\.|[^'])*)'|NULL)\s*\)/g;
    let match;
    while ((match = row.exec(text))) {
      const title = unescapeSql(match[1]).trim();
      if (!title) continue;
      out.push({
        key: `stable-${platform}-${normalize(title)}`,
        platform,
        title,
        releaseYear: match[4] === 'NULL' ? '' : String(match[4] || ''),
        genre: unescapeSql(match[2] || '').trim(),
        franchise: '',
        coverUrl: '',
        source: 'Videogames-Database',
      });
    }
    if (!out.length) throw new Error('Не удалось разобрать SQL-каталог');
    return out;
  }

  async function fetchSql(platform) {
    const file = SQL_FILES[platform];
    if (!file) return [];
    const text = await fetchText(`${SQL_BASE}${file}`, 12000);
    return parseSql(platform, text);
  }

  async function fetchSwitch() {
    const direct = 'https://www.gametdb.com/switchtdb.txt?LANG=EN';
    const urls = [
      direct,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(direct)}`,
    ];
    let text = '';
    let lastError = null;
    for (const url of urls) {
      try {
        text = await fetchText(url, 7000);
        if (text.includes(' = ')) break;
      } catch (error) { lastError = error; }
    }
    if (!text.includes(' = ')) throw lastError || new Error('GameTDB недоступен');

    const out = [];
    for (const line of text.split(/\r?\n/)) {
      const pos = line.indexOf(' = ');
      if (pos <= 0) continue;
      const title = line.slice(pos + 3).trim();
      if (!title) continue;
      out.push({
        key: `stable-SWITCH-${normalize(title)}`,
        platform: 'SWITCH',
        title,
        releaseYear: '',
        genre: '',
        franchise: '',
        coverUrl: '',
        source: 'GameTDB',
      });
    }
    if (!out.length) throw new Error('Пустой Switch-каталог');
    return out;
  }

  function mergePlatform(existing, incoming, platform) {
    const map = new Map();
    for (const item of existing.filter(x => x?.platform === platform)) map.set(keyOf(item), { ...item });
    for (const item of incoming) {
      const key = keyOf(item);
      const old = map.get(key) || {};
      map.set(key, {
        ...old,
        ...item,
        releaseYear: item.releaseYear || old.releaseYear || '',
        genre: item.genre || old.genre || '',
        franchise: old.franchise || item.franchise || '',
        coverUrl: old.coverUrl || item.coverUrl || '',
        key: old.key || item.key,
      });
    }
    return [...map.values()];
  }

  function ensureProgress() {
    let el = document.querySelector('#stableCatalogProgress');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'stableCatalogProgress';
    el.className = 'task-progress visible';
    el.innerHTML = '<div class="task-progress-head"><span>Обновляю каталог</span><b>0%</b></div><div class="task-progress-track"><i></i></div><div class="task-progress-detail">Подготовка…</div>';
    document.body.appendChild(el);
    return el;
  }

  function progress(done, total, detail, error = false) {
    const el = ensureProgress();
    const pct = Math.round((Math.max(0, done) / Math.max(1, total)) * 100);
    el.classList.toggle('error', error);
    const percent = el.querySelector('.task-progress-head b');
    const bar = el.querySelector('.task-progress-track i');
    const detailEl = el.querySelector('.task-progress-detail');
    if (percent) percent.textContent = `${pct}%`;
    if (bar) bar.style.width = `${pct}%`;
    if (detailEl) detailEl.textContent = detail || '';
  }

  function finish(message, error = false) {
    const el = ensureProgress();
    el.classList.toggle('error', error);
    const label = el.querySelector('.task-progress-head span');
    const percent = el.querySelector('.task-progress-head b');
    const bar = el.querySelector('.task-progress-track i');
    const detail = el.querySelector('.task-progress-detail');
    if (label) label.textContent = error ? 'Каталог не обновлён' : 'Каталог обновлён';
    if (percent) percent.textContent = error ? 'Ошибка' : '100%';
    if (bar) bar.style.width = error ? '100%' : '100%';
    if (detail) detail.textContent = message;
    if (error) setTimeout(() => el.remove(), 6500);
  }

  async function refreshStableCatalog() {
    if (running) return;
    running = true;
    const failures = [];
    let successes = 0;
    try {
      const stored = await readCatalog();
      let catalog = Array.isArray(stored.catalog) ? stored.catalog : [];
      const meta = stored.catalogMeta && typeof stored.catalogMeta === 'object' ? { ...stored.catalogMeta } : {};

      for (let i = 0; i < ORDER.length; i++) {
        const platform = ORDER[i];
        progress(i, ORDER.length, `${PLATFORM_NAMES[platform]} · ${i + 1} из ${ORDER.length}`);
        try {
          const incoming = platform === 'SWITCH' ? await fetchSwitch() : await fetchSql(platform);
          const mergedPlatform = mergePlatform(catalog, incoming, platform);
          catalog = catalog.filter(x => x?.platform !== platform).concat(mergedPlatform);
          meta[platform] = {
            updatedAt: new Date().toISOString(),
            count: mergedPlatform.length,
            source: platform === 'SWITCH' ? 'GameTDB' : 'Videogames-Database',
          };
          successes++;
        } catch (error) {
          console.warn(`Stable catalog refresh ${platform}:`, error);
          failures.push(`${PLATFORM_NAMES[platform]}: ${error?.message || 'ошибка'}`);
          // Keep the previous cached platform untouched.
        }
        progress(i + 1, ORDER.length, `${PLATFORM_NAMES[platform]} · готово`);
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      if (!successes) {
        finish(failures[0] || 'Источники каталога временно недоступны', true);
        return;
      }

      await writeCatalog({ catalog, catalogMeta: meta });
      const suffix = failures.length ? ` · не обновились: ${failures.map(x => x.split(':')[0]).join(', ')}` : '';
      finish(`${successes} из ${ORDER.length} платформ${suffix}`);
      try { sessionStorage.setItem('memory-card-catalog-refresh-result', `${successes}/${ORDER.length}`); } catch (_) {}
      setTimeout(() => location.reload(), 900);
    } catch (error) {
      console.error('Stable catalog refresh:', error);
      finish(error?.message || 'Неизвестная ошибка', true);
    } finally {
      running = false;
    }
  }

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('[data-action="catalog-refresh-all"]') : null;
    if (!target) return;
    // Capture phase prevents app.js' older refreshAllCatalog handler from running too.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    refreshStableCatalog();
  }, true);

  window.addEventListener('load', () => {
    try {
      const result = sessionStorage.getItem('memory-card-catalog-refresh-result');
      if (!result) return;
      sessionStorage.removeItem('memory-card-catalog-refresh-result');
      setTimeout(() => {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = `Каталог обновлён: ${result} платформ`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2800);
      }, 350);
    } catch (_) {}
  });
})();