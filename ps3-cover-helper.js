/* Memory Card — PS3 missing-cover fallback via GameTDB, retryable/background v2 */
(() => {
  const DB_URL = 'https://www.gametdb.com/ps3tdb.txt?LANG=EN';
  const DB_CACHE_KEY = 'memory-card-ps3tdb-v1';
  const COVER_CACHE_KEY = 'memory-card-ps3-covers-v2';
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

  // Small verified shortcuts for titles already present in this library. They also make
  // these covers independent from the cross-origin GameTDB title-list request.
  const KNOWN = [
    { title: 'Sonic Unleashed', ids: ['BLUS30244', 'BLES00425'] },
    { title: 'Red Dead Redemption', ids: ['BLUS30418', 'BLES00680'] },
    { title: 'Metal Gear Solid 2 Sons of Liberty HD', ids: ['NPEB00685', 'BLES01419'] },
    { title: 'Metal Gear Solid 3 Snake Eater HD Edition', ids: ['NPUB30610', 'BLES01419'] },
    { title: 'Metal Gear Solid HD Collection', ids: ['BLES01419'] },
  ].map(item => ({ ...item, key: normalize(item.title), simple: simplify(item.title) }));

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

  function knownCandidates(title) {
    const key = normalize(title);
    const simple = simplify(title);
    const item = KNOWN.find(x => x.key === key || (simple && x.simple === simple));
    return item ? item.ids.map((id, index) => ({ id, name: item.title, key, rank: index - 20, score: 0 })) : [];
  }

  async function findCandidates(title) {
    const builtin = knownCandidates(title);
    if (builtin.length) return builtin;

    const wanted = normalize(title);
    const wantedSimple = simplify(title);
    if (!wanted) return [];
    const { entries, exact } = await loadIndex();
    const direct = exact.get(wanted);
    if (direct?.length) return direct.slice(0, 8);

    const first = wantedSimple.split(' ')[0] || wanted.split(' ')[0];
    const pool = first ? entries.filter(x => x.simple.includes(first) || x.key.includes(first)) : entries;
    const matches = [];
    let count = 0;
    for (const item of pool) {
      const rawScore = score(item.key, wanted);
      const simpleScore = wantedSimple ? score(item.simple, wantedSimple) : rawScore;
      const s = Math.min(rawScore, simpleScore);
      if (s <= 30) matches.push({ ...item, score: s });
      if (++count % 500 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    matches.sort((a, b) => a.score - b.score || a.rank - b.rank);
    return matches.slice(0, 8);
  }

  function imageWorks(url, timeoutMs = 2200) {
    return new Promise(resolve => {
      const img = new Image();
      let settled = false;
      const done = ok => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        img.onload = img.onerror = null;
        resolve(ok);
      };
      const timer = setTimeout(() => { img.src = ''; done(false); }, timeoutMs);
      img.onload = () => done(true);
      img.onerror = () => done(false);
      img.referrerPolicy = 'no-referrer';
      img.src = url;
    });
  }

  function preferredRegions(id = '') {
    const upper = String(id).toUpperCase();
    if (/^(BLUS|BCUS|NPUB)/.test(upper)) return ['US', 'EN', 'AU', 'RU', 'DE', 'FR', 'ES'];
    if (/^(BLES|BCES|NPEB)/.test(upper)) return ['EN', 'US', 'DE', 'FR', 'ES', 'AU', 'RU'];
    if (/^(BLJM|BCJM|NPJB)/.test(upper)) return ['JA', 'EN', 'US'];
    if (/^(BLAS|BCAS|NPHB)/.test(upper)) return ['EN', 'US', 'ZH', 'JA'];
    return ['US', 'EN', 'DE', 'FR', 'ES', 'AU', 'RU', 'JA'];
  }

  function artworkUrls(id) {
    const urls = [];
    for (const type of ['coverHQ', 'coverM', 'cover']) {
      for (const region of preferredRegions(id)) {
        // GameTDB PS3 artwork is predominantly JPG. Try that first so a hit is fast.
        urls.push(`https://art.gametdb.com/ps3/${type}/${region}/${id}.jpg`);
        urls.push(`https://art.gametdb.com/ps3/${type}/${region}/${id}.png`);
      }
    }
    return urls;
  }

  async function resolveCover(title) {
    const key = normalize(title);
    if (!key) return '';
    const cache = readJson(COVER_CACHE_KEY, {});
    const hit = cache[key];
    if (hit) {
      const age = Date.now() - Number(hit.at || 0);
      if (hit.url && age < HIT_TTL) return hit.url;
      if (!hit.url && age < MISS_TTL) return '';
    }

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
      // Negative results are deliberately short-lived: a temporary GameTDB/CDN problem
      // must not hide a cover for a month.
      cache[key] = { at: Date.now(), url: '' };
      writeJson(COVER_CACHE_KEY, cache);
    } catch (error) {
      console.warn('Memory Card PS3 cover lookup:', error);
      // Do not cache transport errors as a real "no cover" result.
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
    if (!container?.isConnected || container.querySelector('img')) return true;
    const title = getTitle(container);
    if (!title) return false;
    const url = await resolveCover(title);
    if (!url || !container.isConnected || container.querySelector('img')) return false;

    return await new Promise(resolve => {
      const img = new Image();
      img.loading = 'lazy';
      img.alt = `Обложка ${title}`;
      img.referrerPolicy = 'no-referrer';
      img.onload = () => {
        if (!container.isConnected || container.querySelector('img')) return resolve(false);
        container.prepend(img);
        container.classList.add('has-image');
        container.classList.remove('image-failed');
        container.dataset.coverSource = 'gametdb-ps3';
        resolve(true);
      };
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }

  async function pump() {
    if (working || document.hidden) return;
    working = true;
    try {
      while (queue.length && !document.hidden) {
        const container = queue.shift();
        if (!container?.isConnected) continue;
        container.dataset.ps3CoverState = 'working';
        const ok = await enhance(container);
        if (ok) {
          container.dataset.ps3CoverState = 'done';
          delete container.dataset.ps3CoverRetryAt;
        } else {
          container.dataset.ps3CoverState = 'retry';
          container.dataset.ps3CoverRetryAt = String(Date.now() + DOM_RETRY_MS);
        }
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
      const state = el.dataset.ps3CoverState || '';
      if (state === 'queued' || state === 'working' || state === 'done') continue;
      const retryAt = Number(el.dataset.ps3CoverRetryAt || 0);
      if (retryAt && retryAt > now) continue;
      el.dataset.ps3CoverState = 'queued';
      queue.push(el);
    }
    pump();
  }

  function scheduleScan(delay = 700) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      const run = () => scan();
      if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 1200 });
      else setTimeout(run, 0);
    }, delay);
  }

  window.addEventListener('load', () => scheduleScan(1000));
  window.addEventListener('pageshow', () => scheduleScan(700));
  document.addEventListener('click', () => scheduleScan(450));
  document.addEventListener('change', () => scheduleScan(450));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleScan(650); });
  setInterval(() => { if (!document.hidden) scheduleScan(0); }, 15_000);
})();
