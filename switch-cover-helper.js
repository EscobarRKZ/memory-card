/* Memory Card — Nintendo Switch cover enhancer, idle/background v2 */
(() => {
  const DB_URL = 'https://www.gametdb.com/switchtdb.txt?LANG=EN';
  const DB_CACHE_KEY = 'memory-card-switchtdb-v2';
  const COVER_CACHE_KEY = 'memory-card-switch-covers-v2';
  const DB_TTL = 1000 * 60 * 60 * 24 * 7;
  const COVER_TTL = 1000 * 60 * 60 * 24 * 30;
  let dbPromise = null;
  let indexPromise = null;
  let scanTimer = 0;
  const queue = [];
  let working = false;

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

  async function fetchText(url, timeoutMs = 5000) {
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
      const sources = [DB_URL, `https://api.allorigins.win/raw?url=${encodeURIComponent(DB_URL)}`];
      let lastError = null;
      for (const url of sources) {
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

  async function loadIndex() {
    if (indexPromise) return indexPromise;
    indexPromise = (async () => {
      const text = await loadDatabase();
      const entries = [];
      const exact = new Map();
      for (const line of text.split(/\r?\n/)) {
        const sep = line.indexOf(' = ');
        if (sep <= 0) continue;
        const id = line.slice(0, sep).trim();
        const name = line.slice(sep + 3).trim();
        const key = normalize(name);
        if (!id || !name || !key) continue;
        const item = { id, name, key };
        entries.push(item);
        if (!exact.has(key)) exact.set(key, item);
      }
      return { entries, exact };
    })();
    try { return await indexPromise; }
    catch (e) { indexPromise = null; throw e; }
  }

  function score(candidate, wanted) {
    if (candidate === wanted) return 0;
    if (candidate.startsWith(wanted) || wanted.startsWith(candidate)) return 6 + Math.abs(candidate.length - wanted.length) / 6;
    if (candidate.includes(wanted) || wanted.includes(candidate)) return 12 + Math.abs(candidate.length - wanted.length) / 5;
    const aa = new Set(candidate.split(' ').filter(Boolean));
    const bb = new Set(wanted.split(' ').filter(Boolean));
    const common = [...bb].filter(x => aa.has(x)).length;
    const union = new Set([...aa, ...bb]).size || 1;
    return 100 - (common / union) * 82 + Math.abs(aa.size - bb.size) * 2;
  }

  async function findGameId(title) {
    const wanted = normalize(title);
    if (!wanted) return null;
    const { entries, exact } = await loadIndex();
    const direct = exact.get(wanted);
    if (direct) return direct;

    const first = wanted.split(' ')[0];
    const candidates = first ? entries.filter(x => x.key.includes(first)) : entries;
    let best = null;
    let i = 0;
    for (const item of candidates) {
      const s = score(item.key, wanted);
      if (!best || s < best.score) best = { ...item, score: s };
      if (++i % 500 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    return best && best.score <= 30 ? best : null;
  }

  function imageWorks(url, timeoutMs = 3500) {
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
      const candidates = [];
      for (const type of ['coverHQ', 'coverM']) {
        for (const region of ['US', 'EN', 'AU', 'CA']) {
          candidates.push(`https://art.gametdb.com/switch/${type}/${region}/${match.id}.png`);
          candidates.push(`https://art.gametdb.com/switch/${type}/${region}/${match.id}.jpg`);
        }
      }
      for (const url of candidates) {
        if (await imageWorks(url)) {
          cache[key] = { at: Date.now(), url, matchedTitle: match.name };
          writeJson(COVER_CACHE_KEY, cache);
          return url;
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
    if (!container?.isConnected) return;
    const title = getTitle(container);
    if (!title) return;
    const url = await resolveCover(title);
    if (!url || !container.isConnected) return;
    const existing = container.querySelector('img');
    if (existing?.src === url) return;
    const img = new Image();
    img.loading = 'lazy';
    img.alt = `Обложка ${title}`;
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      if (!container.isConnected) return;
      existing?.remove();
      container.prepend(img);
      container.classList.add('has-image');
      container.classList.remove('image-failed');
      container.dataset.coverSource = 'gametdb-switch';
    };
    img.src = url;
  }

  async function pump() {
    if (working || document.hidden) return;
    working = true;
    try {
      while (queue.length && !document.hidden) {
        const container = queue.shift();
        await enhance(container);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    } finally {
      working = false;
    }
  }

  function scan() {
    for (const el of document.querySelectorAll('.cover, .detail-cover, .mini-cover, .playing-cover')) {
      if (!(el instanceof HTMLElement) || el.dataset.switchCoverAttempted === '1') continue;
      const badge = el.querySelector('.cover-platform-badge');
      if (!badge || badge.textContent.trim().toLowerCase() !== 'switch') continue;
      el.dataset.switchCoverAttempted = '1';
      queue.push(el);
    }
    pump();
  }

  function scheduleScan(delay = 1200) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      const run = () => scan();
      if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 1800 });
      else setTimeout(run, 0);
    }, delay);
  }

  // Covers are enrichment, never startup-critical. Do them only after the UI has had
  // time to become interactive and after user-driven redraws have settled.
  window.addEventListener('load', () => scheduleScan(2500));
  window.addEventListener('pageshow', () => scheduleScan(1800));
  document.addEventListener('click', () => scheduleScan(1200));
  document.addEventListener('change', () => scheduleScan(1200));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleScan(1600); });
  setInterval(() => { if (!document.hidden) scheduleScan(0); }, 10000);
})();
