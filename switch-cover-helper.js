/* Memory Card — Nintendo Switch cover enhancer, resilient v4 */
(() => {
  const DB_URL = 'https://www.gametdb.com/switchtdb.txt?LANG=EN';
  const DB_CACHE_KEY = 'memory-card-switchtdb-v2';
  const COVER_CACHE_KEY = 'memory-card-switch-covers-v4';
  const DB_TTL = 1000 * 60 * 60 * 24 * 7;
  const HIT_TTL = 1000 * 60 * 60 * 24 * 30;
  const MISS_TTL = 1000 * 60 * 8;
  const DOM_RETRY_MS = 45_000;
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

  const simplify = value => normalize(value)
    .replace(/\b(game of the year|goty|ultimate|deluxe|complete|edition|version)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || '') || fallback; }
    catch (_) { return fallback; }
  }
  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }
  function proxyUrl(source) {
    return `https://images.weserv.nl/?url=${encodeURIComponent(source)}&output=webp&q=90`;
  }
  function expandSources(sources = []) {
    const out = [];
    for (const source of sources) {
      if (!source) continue;
      out.push(proxyUrl(source));
      out.push(source);
    }
    return [...new Set(out)];
  }

  async function fetchText(url, timeoutMs = 6500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      if (!text.includes(' = ')) throw new Error('Unexpected GameTDB response');
      return text;
    } finally { clearTimeout(timer); }
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
        } catch (error) { lastError = error; }
      }
      throw lastError || new Error('GameTDB Switch unavailable');
    })();
    try { return await dbPromise; }
    catch (error) { dbPromise = null; throw error; }
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
        const item = { id, name, key, simple: simplify(name) };
        entries.push(item);
        if (!exact.has(key)) exact.set(key, item);
      }
      return { entries, exact };
    })();
    try { return await indexPromise; }
    catch (error) { indexPromise = null; throw error; }
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

  async function findGame(title) {
    const wanted = normalize(title);
    const simpleWanted = simplify(title);
    if (!wanted) return null;
    const { entries, exact } = await loadIndex();
    const direct = exact.get(wanted);
    if (direct) return direct;
    const first = simpleWanted.split(' ')[0];
    const pool = first ? entries.filter(x => x.simple.includes(first)) : entries;
    let best = null;
    let count = 0;
    for (const item of pool) {
      const s = Math.min(score(item.key, wanted), score(item.simple, simpleWanted));
      if (!best || s < best.score) best = { ...item, score: s };
      if (++count % 500 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    return best && best.score <= 30 ? best : null;
  }

  function sourceUrlsForId(id) {
    const direct = [];
    for (const type of ['coverHQ','coverM','cover']) {
      for (const region of ['US','EN','AU','CA','JA']) {
        direct.push(`https://art.gametdb.com/switch/${type}/${region}/${id}.jpg`);
        direct.push(`https://art.gametdb.com/switch/${type}/${region}/${id}.png`);
      }
    }
    return expandSources(direct);
  }

  async function buildCandidates(title) {
    try {
      const match = await findGame(title);
      return match ? sourceUrlsForId(match.id) : [];
    } catch (error) {
      console.warn('Memory Card Switch title lookup:', error);
      return [];
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

  function installImage(container, title, urls, cacheKey) {
    return new Promise(resolve => {
      let index = 0;
      const img = new Image();
      img.loading = 'lazy';
      img.alt = `Обложка ${title}`;
      const tryNext = () => {
        if (!container?.isConnected || index >= urls.length) { resolve(false); return; }
        img.src = urls[index++];
      };
      img.onload = () => {
        if (!container?.isConnected) { resolve(false); return; }
        container.querySelector('img')?.remove();
        container.prepend(img);
        container.classList.add('has-image');
        container.classList.remove('image-failed');
        container.dataset.coverSource = 'gametdb-switch';
        const cache = readJson(COVER_CACHE_KEY, {});
        cache[cacheKey] = { at: Date.now(), url: img.currentSrc || img.src };
        writeJson(COVER_CACHE_KEY, cache);
        resolve(true);
      };
      img.onerror = tryNext;
      tryNext();
    });
  }

  async function enhance(container) {
    if (!container?.isConnected) return;
    const title = getTitle(container);
    if (!title) return;
    const key = normalize(title);
    const cache = readJson(COVER_CACHE_KEY, {});
    const hit = cache[key];
    let urls = [];
    if (hit?.url && Date.now() - Number(hit.at || 0) < HIT_TTL) urls.push(hit.url);
    urls.push(...await buildCandidates(title));
    urls = [...new Set(urls)];
    if (!urls.length) {
      if (!hit || Date.now() - Number(hit.at || 0) > MISS_TTL) {
        cache[key] = { at: Date.now(), url: '' };
        writeJson(COVER_CACHE_KEY, cache);
      }
      container.dataset.switchCoverRetryAt = String(Date.now() + DOM_RETRY_MS);
      return;
    }
    const ok = await installImage(container, title, urls, key);
    if (!ok) {
      cache[key] = { at: Date.now(), url: '' };
      writeJson(COVER_CACHE_KEY, cache);
      container.dataset.switchCoverRetryAt = String(Date.now() + DOM_RETRY_MS);
    }
  }

  async function pump() {
    if (working || document.hidden) return;
    working = true;
    try {
      while (queue.length && !document.hidden) {
        const container = queue.shift();
        try { await enhance(container); }
        finally { if (container) container.dataset.switchCoverQueued = ''; }
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    } finally { working = false; }
  }

  function scan() {
    const now = Date.now();
    for (const el of document.querySelectorAll('.cover, .detail-cover, .mini-cover, .playing-cover')) {
      if (!(el instanceof HTMLElement)) continue;
      const badge = el.querySelector('.cover-platform-badge');
      if (!badge || badge.textContent.trim().toLowerCase() !== 'switch') continue;
      const retryAt = Number(el.dataset.switchCoverRetryAt || 0);
      if (retryAt && retryAt > now) continue;
      if (el.dataset.switchCoverQueued === '1') continue;
      el.dataset.switchCoverQueued = '1';
      queue.push(el);
    }
    pump();
  }

  function scheduleScan(delay = 600) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      const run = () => scan();
      if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 1100 });
      else setTimeout(run, 0);
    }, delay);
  }

  window.addEventListener('load', () => scheduleScan(1000));
  window.addEventListener('pageshow', () => scheduleScan(700));
  document.addEventListener('click', () => scheduleScan(450));
  document.addEventListener('change', () => scheduleScan(450));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleScan(700); });
  setInterval(() => { if (!document.hidden) scheduleScan(0); }, 15000);
})();
