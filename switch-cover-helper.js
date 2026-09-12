/* Memory Card — Nintendo Switch cover enhancer (GameTDB fallback) */
(() => {
  const DB_URL = 'https://www.gametdb.com/switchtdb.txt?LANG=EN';
  const DB_CACHE_KEY = 'memory-card-switchtdb-v1';
  const COVER_CACHE_KEY = 'memory-card-switch-covers-v1';
  const DB_TTL = 1000 * 60 * 60 * 24 * 7;
  const COVER_TTL = 1000 * 60 * 60 * 24 * 30;
  let dbPromise = null;
  let scheduled = false;

  const normalize = value => String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[™®©]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(nintendo switch|switch edition|digital edition)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || '') || fallback; }
    catch (_) { return fallback; }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  async function fetchText(url, timeoutMs = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      if (!text.includes(' = ')) throw new Error('Unexpected GameTDB response');
      return text;
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadDatabase() {
    if (dbPromise) return dbPromise;
    dbPromise = (async () => {
      const cached = readJson(DB_CACHE_KEY, null);
      if (cached?.text && Date.now() - Number(cached.at || 0) < DB_TTL) return cached.text;

      const proxies = [
        DB_URL,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(DB_URL)}`,
        `https://corsproxy.io/?url=${encodeURIComponent(DB_URL)}`,
      ];
      let lastError = null;
      for (const url of proxies) {
        try {
          const text = await fetchText(url);
          writeJson(DB_CACHE_KEY, { at: Date.now(), text });
          return text;
        } catch (e) { lastError = e; }
      }
      throw lastError || new Error('GameTDB unavailable');
    })();
    try { return await dbPromise; }
    catch (e) { dbPromise = null; throw e; }
  }

  function scoreTitle(candidate, wanted) {
    const a = normalize(candidate);
    const b = normalize(wanted);
    if (!a || !b) return 999;
    if (a === b) return 0;
    if (a.startsWith(b) || b.startsWith(a)) return 6 + Math.abs(a.length - b.length) / 6;
    if (a.includes(b) || b.includes(a)) return 12 + Math.abs(a.length - b.length) / 5;
    const aa = new Set(a.split(' ').filter(Boolean));
    const bb = new Set(b.split(' ').filter(Boolean));
    const common = [...bb].filter(x => aa.has(x)).length;
    const union = new Set([...aa, ...bb]).size || 1;
    return 100 - (common / union) * 82 + Math.abs(aa.size - bb.size) * 2;
  }

  async function findGameId(title) {
    const text = await loadDatabase();
    let best = null;
    for (const line of text.split(/\r?\n/)) {
      const sep = line.indexOf(' = ');
      if (sep <= 0) continue;
      const id = line.slice(0, sep).trim();
      const name = line.slice(sep + 3).trim();
      if (!id || !name) continue;
      const score = scoreTitle(name, title);
      if (!best || score < best.score) best = { id, name, score };
      if (score === 0) break;
    }
    return best && best.score <= 30 ? best : null;
  }

  function imageWorks(url, timeoutMs = 7000) {
    return new Promise(resolve => {
      const img = new Image();
      const timer = setTimeout(() => { img.src = ''; resolve(false); }, timeoutMs);
      img.onload = () => { clearTimeout(timer); resolve(true); };
      img.onerror = () => { clearTimeout(timer); resolve(false); };
      img.referrerPolicy = 'no-referrer';
      img.src = url;
    });
  }

  async function resolveCover(title) {
    const key = normalize(title);
    if (!key) return '';
    const cache = readJson(COVER_CACHE_KEY, {});
    const hit = cache[key];
    if (hit && Date.now() - Number(hit.at || 0) < COVER_TTL) return hit.url || '';

    try {
      const match = await findGameId(title);
      if (!match) {
        cache[key] = { at: Date.now(), url: '' };
        writeJson(COVER_CACHE_KEY, cache);
        return '';
      }

      const regions = ['US', 'EN', 'AU', 'CA'];
      const types = ['coverHQ', 'coverM'];
      const exts = ['png', 'jpg'];
      for (const type of types) {
        for (const region of regions) {
          for (const ext of exts) {
            const url = `https://art.gametdb.com/switch/${type}/${region}/${match.id}.${ext}`;
            if (await imageWorks(url)) {
              cache[key] = { at: Date.now(), url, matchedTitle: match.name };
              writeJson(COVER_CACHE_KEY, cache);
              return url;
            }
          }
        }
      }
      cache[key] = { at: Date.now(), url: '' };
      writeJson(COVER_CACHE_KEY, cache);
      return '';
    } catch (e) {
      console.warn('Memory Card Switch cover lookup:', e);
      return '';
    }
  }

  function getTitle(container) {
    const card = container.closest('.game-card');
    if (card) return card.querySelector('.game-body h3')?.textContent?.trim() || '';
    const row = container.closest('.game-row');
    if (row) return row.querySelector('.game-title')?.textContent?.trim() || '';
    const playing = container.closest('.playing-card');
    if (playing) return playing.querySelector('.game-title')?.textContent?.trim() || '';
    const detail = container.closest('.game-detail-hero');
    if (detail) return detail.querySelector('.game-detail-title h3')?.textContent?.trim() || '';
    return '';
  }

  async function enhance(container) {
    if (!(container instanceof HTMLElement)) return;
    if (container.dataset.switchCoverBusy === '1') return;
    const badge = container.querySelector('.cover-platform-badge');
    if (!badge || badge.textContent.trim().toLowerCase() !== 'switch') return;
    const title = getTitle(container);
    if (!title) return;

    container.dataset.switchCoverBusy = '1';
    const url = await resolveCover(title);
    if (!url) {
      container.dataset.switchCoverBusy = '0';
      return;
    }

    const existing = container.querySelector('img');
    if (existing?.src === url) return;
    const img = new Image();
    img.loading = 'lazy';
    img.alt = `Обложка ${title}`;
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      existing?.remove();
      container.prepend(img);
      container.classList.add('has-image');
      container.classList.remove('image-failed');
      container.dataset.coverSource = 'gametdb-switch';
    };
    img.onerror = () => { container.dataset.switchCoverBusy = '0'; };
    img.src = url;
  }

  function scan() {
    document.querySelectorAll('.cover, .detail-cover, .mini-cover, .playing-cover').forEach(el => enhance(el));
  }

  function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      scan();
    }, 180);
  }

  new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('load', scheduleScan);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleScan(); });
})();
