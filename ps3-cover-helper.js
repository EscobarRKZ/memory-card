/* Memory Card — PS3 missing-cover fallback via GameTDB, idle/background v1 */
(() => {
  const DB_URL = 'https://www.gametdb.com/ps3tdb.txt?LANG=EN';
  const DB_CACHE_KEY = 'memory-card-ps3tdb-v1';
  const COVER_CACHE_KEY = 'memory-card-ps3-covers-v1';
  const DB_TTL = 1000 * 60 * 60 * 24 * 7;
  const COVER_TTL = 1000 * 60 * 60 * 24 * 30;
  let dbPromise = null;
  let indexPromise = null;
  let scanTimer = 0;
  let working = false;
  const queue = [];

  const normalize = value => String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[™®©]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(playstation 3|ps3)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || '') || fallback; }
    catch (_) { return fallback; }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
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
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadDatabase() {
    if (dbPromise) return dbPromise;
    dbPromise = (async () => {
      const cached = readJson(DB_CACHE_KEY, null);
      if (cached?.text && Date.now() - Number(cached.at || 0) < DB_TTL) return cached.text;
      const urls = [
        DB_URL,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(DB_URL)}`,
      ];
      let lastError = null;
      for (const url of urls) {
        try {
          const text = await fetchText(url);
          writeJson(DB_CACHE_KEY, { at: Date.now(), text });
          return text;
        } catch (error) { lastError = error; }
      }
      throw lastError || new Error('GameTDB PS3 unavailable');
    })();
    try { return await dbPromise; }
    catch (error) { dbPromise = null; throw error; }
  }

  function regionRank(id = '') {
    const upper = String(id).toUpperCase();
    if (/^(BLUS|BCUS)/.test(upper)) return 0; // retail US first
    if (/^(BLES|BCES)/.test(upper)) return 1; // retail Europe
    if (/^(BLAS|BCAS)/.test(upper)) return 2; // retail Asia
    if (/^(BLJM|BCJM)/.test(upper)) return 3; // retail Japan
    if (/^(BLKS|BCKS)/.test(upper)) return 4; // retail Korea
    if (/^NP/.test(upper)) return 9;          // SEN / download last
    return 5;
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
        const item = { id, name, key, rank: regionRank(id) };
        entries.push(item);
        const bucket = exact.get(key) || [];
        bucket.push(item);
        exact.set(key, bucket);
      }
      for (const bucket of exact.values()) bucket.sort((a, b) => a.rank - b.rank);
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

  async function findCandidates(title) {
    const wanted = normalize(title);
    if (!wanted) return [];
    const { entries, exact } = await loadIndex();
    const direct = exact.get(wanted);
    if (direct?.length) return direct.slice(0, 6);

    const first = wanted.split(' ')[0];
    const pool = first ? entries.filter(x => x.key.includes(first)) : entries;
    const matches = [];
    let count = 0;
    for (const item of pool) {
      const s = score(item.key, wanted);
      if (s <= 28) matches.push({ ...item, score: s });
      if (++count % 500 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    matches.sort((a, b) => a.score - b.score || a.rank - b.rank);
    return matches.slice(0, 6);
  }

  function imageWorks(url, timeoutMs = 3000) {
    return new Promise(resolve => {
      const img = new Image();
      const timer = setTimeout(() => { img.src = ''; resolve(false); }, timeoutMs);
      img.onload = () => { clearTimeout(timer); resolve(true); };
      img.onerror = () => { clearTimeout(timer); resolve(false); };
      img.referrerPolicy = 'no-referrer';
      img.src = url;
    });
  }

  function artworkUrls(id) {
    const regions = ['US', 'EN', 'AU', 'RU'];
    const types = ['coverHQ', 'coverM', 'cover'];
    const urls = [];
    for (const type of types) {
      for (const region of regions) {
        urls.push(`https://art.gametdb.com/ps3/${type}/${region}/${id}.png`);
        urls.push(`https://art.gametdb.com/ps3/${type}/${region}/${id}.jpg`);
      }
    }
    return urls;
  }

  async function resolveCover(title) {
    const key = normalize(title);
    if (!key) return '';
    const cache = readJson(COVER_CACHE_KEY, {});
    const hit = cache[key];
    if (hit && Date.now() - Number(hit.at || 0) < COVER_TTL) return hit.url || '';

    try {
      const matches = await findCandidates(title);
      for (const match of matches) {
        for (const url of artworkUrls(match.id)) {
          if (await imageWorks(url)) {
            cache[key] = { at: Date.now(), url, id: match.id, matchedTitle: match.name };
            writeJson(COVER_CACHE_KEY, cache);
            return url;
          }
        }
      }
      cache[key] = { at: Date.now(), url: '' };
      writeJson(COVER_CACHE_KEY, cache);
    } catch (error) {
      console.warn('Memory Card PS3 cover lookup:', error);
    }
    return '';
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
    if (!container?.isConnected || container.querySelector('img')) return;
    const title = getTitle(container);
    if (!title) return;
    const url = await resolveCover(title);
    if (!url || !container.isConnected || container.querySelector('img')) return;

    const img = new Image();
    img.loading = 'lazy';
    img.alt = `Обложка ${title}`;
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      if (!container.isConnected || container.querySelector('img')) return;
      container.prepend(img);
      container.classList.add('has-image');
      container.classList.remove('image-failed');
      container.dataset.coverSource = 'gametdb-ps3';
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
      if (!(el instanceof HTMLElement) || el.dataset.ps3CoverAttempted === '1' || el.querySelector('img')) continue;
      const badge = el.querySelector('.cover-platform-badge');
      if (!badge || badge.textContent.trim().toLowerCase() !== 'ps3') continue;
      el.dataset.ps3CoverAttempted = '1';
      queue.push(el);
    }
    pump();
  }

  function scheduleScan(delay = 900) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      const run = () => scan();
      if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 1400 });
      else setTimeout(run, 0);
    }, delay);
  }

  // Missing covers are enrichment only and never block navigation/rendering.
  window.addEventListener('load', () => scheduleScan(1800));
  window.addEventListener('pageshow', () => scheduleScan(1200));
  document.addEventListener('click', () => scheduleScan(700));
  document.addEventListener('change', () => scheduleScan(700));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleScan(1000); });
  setInterval(() => { if (!document.hidden) scheduleScan(0); }, 12000);
})();