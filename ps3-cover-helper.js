/* Memory Card — PS3 cover enhancer, resilient v3 */
(() => {
  const DB_URL = 'https://www.gametdb.com/ps3tdb.txt?LANG=EN';
  const DB_CACHE_KEY = 'memory-card-ps3tdb-v1';
  const COVER_CACHE_KEY = 'memory-card-ps3-covers-v3';
  const DB_TTL = 1000 * 60 * 60 * 24 * 7;
  const HIT_TTL = 1000 * 60 * 60 * 24 * 30;
  const MISS_TTL = 1000 * 60 * 8;
  const DOM_RETRY_MS = 45_000;
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

  const simplify = value => normalize(value)
    .replace(/\b(game of the year|goty|ultimate|remastered|remaster|edition|version)\b/g, ' ')
    .replace(/\bhd\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const KNOWN = [
    { match: /^sonic unleashed$/, sources: ['https://art.gametdb.com/ps3/coverHQ/US/BLUS30244.jpg','https://art.gametdb.com/ps3/coverM/US/BLUS30244.jpg'] },
    { match: /^red dead redemption$/, sources: ['https://art.gametdb.com/ps3/coverHQ/US/BLUS30418.jpg','https://art.gametdb.com/ps3/coverM/US/BLUS30418.jpg'] },
    { match: /^metal gear solid 2 sons of liberty(?: hd)?$/, sources: ['https://art.gametdb.com/ps3/coverHQ/EN/BLES01419.jpg','https://art.gametdb.com/ps3/coverM/EN/BLES01419.jpg'] },
    { match: /^metal gear solid 3 snake eater(?: hd)?(?: edition)?$/, sources: ['https://art.gametdb.com/ps3/coverHQ/EN/BLES01419.jpg','https://art.gametdb.com/ps3/coverM/EN/BLES01419.jpg'] },
    { match: /^metal gear solid hd collection$/, sources: ['https://art.gametdb.com/ps3/coverHQ/EN/BLES01419.jpg','https://art.gametdb.com/ps3/coverM/EN/BLES01419.jpg'] },
  ];

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
      const urls = [DB_URL, `https://api.allorigins.win/raw?url=${encodeURIComponent(DB_URL)}`];
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
    if (/^(BLUS|BCUS)/.test(upper)) return 0;
    if (/^(BLES|BCES)/.test(upper)) return 1;
    if (/^(BLAS|BCAS)/.test(upper)) return 2;
    if (/^(BLJM|BCJM)/.test(upper)) return 3;
    if (/^(BLKS|BCKS)/.test(upper)) return 4;
    if (/^NP/.test(upper)) return 9;
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
        const item = { id, name, key, simple: simplify(name), rank: regionRank(id) };
        entries.push(item);
        const bucket = exact.get(key) || [];
        bucket.push(item);
        exact.set(key, bucket);
      }
      for (const bucket of exact.values()) bucket.sort((a,b) => a.rank - b.rank);
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
    const simpleWanted = simplify(title);
    if (!wanted) return [];
    const { entries, exact } = await loadIndex();
    const direct = exact.get(wanted);
    if (direct?.length) return direct.slice(0, 5);
    const first = simpleWanted.split(' ')[0];
    const pool = first ? entries.filter(x => x.simple.includes(first)) : entries;
    const matches = [];
    let count = 0;
    for (const item of pool) {
      const s = Math.min(score(item.key, wanted), score(item.simple, simpleWanted));
      if (s <= 28) matches.push({ ...item, score: s });
      if (++count % 500 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    matches.sort((a,b) => a.score - b.score || a.rank - b.rank);
    return matches.slice(0, 5);
  }

  function knownSources(title) {
    const key = simplify(title);
    const found = KNOWN.find(item => item.match.test(key));
    return found ? expandSources(found.sources) : [];
  }

  function sourceUrlsForId(id) {
    const regions = ['US','EN','AU','RU'];
    const types = ['coverHQ','coverM','cover'];
    const direct = [];
    for (const type of types) for (const region of regions) {
      direct.push(`https://art.gametdb.com/ps3/${type}/${region}/${id}.jpg`);
      direct.push(`https://art.gametdb.com/ps3/${type}/${region}/${id}.png`);
    }
    return expandSources(direct);
  }

  async function buildCandidates(title) {
    const known = knownSources(title);
    if (known.length) return known;
    try {
      const matches = await findCandidates(title);
      return [...new Set(matches.flatMap(match => sourceUrlsForId(match.id)))];
    } catch (error) {
      console.warn('Memory Card PS3 title lookup:', error);
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
        container.dataset.coverSource = 'gametdb-ps3';
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
    if (!container?.isConnected || container.querySelector('img')) return;
    const title = getTitle(container);
    if (!title) return;
    const key = normalize(title);
    const cache = readJson(COVER_CACHE_KEY, {});
    const hit = cache[key];
    let urls = [];
    if (hit?.url && Date.now() - Number(hit.at || 0) < HIT_TTL) urls.push(hit.url);
    const built = await buildCandidates(title);
    urls.push(...built);
    urls = [...new Set(urls)];
    if (!urls.length) {
      if (!hit || Date.now() - Number(hit.at || 0) > MISS_TTL) {
        cache[key] = { at: Date.now(), url: '' };
        writeJson(COVER_CACHE_KEY, cache);
      }
      container.dataset.ps3CoverRetryAt = String(Date.now() + DOM_RETRY_MS);
      return;
    }
    const ok = await installImage(container, title, urls, key);
    if (!ok) {
      cache[key] = { at: Date.now(), url: '' };
      writeJson(COVER_CACHE_KEY, cache);
      container.dataset.ps3CoverRetryAt = String(Date.now() + DOM_RETRY_MS);
    }
  }

  async function pump() {
    if (working || document.hidden) return;
    working = true;
    try {
      while (queue.length && !document.hidden) {
        const container = queue.shift();
        try { await enhance(container); }
        finally { if (container) container.dataset.ps3CoverQueued = ''; }
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    } finally { working = false; }
  }

  function scan() {
    const now = Date.now();
    for (const el of document.querySelectorAll('.cover, .detail-cover, .mini-cover, .playing-cover')) {
      if (!(el instanceof HTMLElement) || el.querySelector('img')) continue;
      const badge = el.querySelector('.cover-platform-badge');
      if (!badge || badge.textContent.trim().toLowerCase() !== 'ps3') continue;
      const retryAt = Number(el.dataset.ps3CoverRetryAt || 0);
      if (retryAt && retryAt > now) continue;
      if (el.dataset.ps3CoverQueued === '1') continue;
      el.dataset.ps3CoverQueued = '1';
      queue.push(el);
    }
    pump();
  }

  function scheduleScan(delay = 450) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      const run = () => scan();
      if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 900 });
      else setTimeout(run, 0);
    }, delay);
  }

  window.addEventListener('load', () => scheduleScan(700));
  window.addEventListener('pageshow', () => scheduleScan(500));
  document.addEventListener('click', () => scheduleScan(300));
  document.addEventListener('change', () => scheduleScan(300));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleScan(500); });
  setInterval(() => { if (!document.hidden) scheduleScan(0); }, 15000);
})();
