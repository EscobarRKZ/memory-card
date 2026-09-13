(() => {
  const CACHE_KEY = 'memory-card-ps3-wikipedia-covers-v1';
  const HIT_TTL = 1000 * 60 * 60 * 24 * 30;
  const MISS_TTL = 1000 * 60 * 10;
  const queue = [];
  let working = false;
  let timer = 0;

  const normalize = value => String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[™®©]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const simplify = value => normalize(value)
    .replace(/\b(game of the year|goty|ultimate|remastered|remaster|edition|version)\b/g, ' ')
    .replace(/\bhd\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const aliases = [
    [/^sonic unleashed$/, 'Sonic Unleashed'],
    [/^red dead redemption$/, 'Red Dead Redemption'],
    [/^metal gear solid 2 sons of liberty$/, 'Metal Gear Solid HD Collection'],
    [/^metal gear solid 3 snake eater$/, 'Metal Gear Solid HD Collection'],
    [/^metal gear solid hd collection$/, 'Metal Gear Solid HD Collection'],
    [/^resident evil 4$/, 'Resident Evil 4'],
  ];

  function cacheRead() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; }
    catch (_) { return {}; }
  }
  function cacheWrite(value) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(value)); } catch (_) {}
  }

  function pageFor(title) {
    const key = simplify(title);
    const alias = aliases.find(([rx]) => rx.test(key));
    if (alias) return alias[1];
    return String(title || '')
      .replace(/\s*[-–—]\s*HD(?:\s+Edition)?\s*$/i, '')
      .replace(/\s+HD(?:\s+Edition)?\s*$/i, '')
      .trim();
  }

  async function fetchJson(url, timeout = 8000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const r = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } finally {
      clearTimeout(id);
    }
  }

  function imageScore(img) {
    const alt = img.getAttribute('alt') || '';
    const href = img.closest('a')?.getAttribute('href') || '';
    const src = img.getAttribute('src') || '';
    const meta = `${alt} ${href} ${src}`;
    if (/\b(logo|icon|screenshot|gameplay|map|symbol|wordmark|portrait|photo)\b/i.test(meta)) return 999;
    let score = 0;
    if (/\b(cover|box|boxart|box art|packaging|game cover)\b/i.test(meta)) score -= 20;
    const w = Number(img.getAttribute('width') || 0);
    const h = Number(img.getAttribute('height') || 0);
    if (w && h) {
      const ratio = h / w;
      if (ratio >= 1.12 && ratio <= 1.95) score -= 8;
      else if (ratio < .85) score += 12;
    }
    return score;
  }

  async function coverFromPage(page) {
    if (!page) return '';
    const api = `https://en.wikipedia.org/w/api.php?action=parse&format=json&origin=*&page=${encodeURIComponent(page)}&prop=text&disableeditsection=1`;
    const data = await fetchJson(api);
    const html = data?.parse?.text?.['*'] || '';
    if (!html) return '';
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const candidates = [...doc.querySelectorAll('table.infobox img')]
      .map((img, i) => ({ img, i, score: imageScore(img) }))
      .filter(x => x.score < 999)
      .sort((a, b) => a.score - b.score || a.i - b.i);
    for (const { img } of candidates) {
      let src = img.getAttribute('src') || img.getAttribute('data-src') || '';
      if (src.startsWith('//')) src = `https:${src}`;
      if (/^https:\/\/upload\.wikimedia\.org\//i.test(src)) return src;
    }
    return '';
  }

  async function resolve(title) {
    const key = normalize(title);
    if (!key) return '';
    const cache = cacheRead();
    const hit = cache[key];
    const age = hit ? Date.now() - Number(hit.at || 0) : Infinity;
    if (hit?.url && age < HIT_TTL) return hit.url;
    if (hit && !hit.url && age < MISS_TTL) return '';

    const wantedPage = pageFor(title);
    let url = '';
    try {
      url = await coverFromPage(wantedPage);
      if (!url) {
        const search = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&list=search&srlimit=4&srnamespace=0&srsearch=${encodeURIComponent(`\"${wantedPage}\" video game`)}`;
        const data = await fetchJson(search, 7000);
        const rows = data?.query?.search || [];
        const wanted = simplify(wantedPage);
        rows.sort((a, b) => {
          const aa = simplify(a.title), bb = simplify(b.title);
          const ar = aa === wanted ? 0 : (aa.includes(wanted) || wanted.includes(aa) ? 1 : 2);
          const br = bb === wanted ? 0 : (bb.includes(wanted) || wanted.includes(bb) ? 1 : 2);
          return ar - br;
        });
        for (const row of rows.slice(0, 2)) {
          url = await coverFromPage(row.title);
          if (url) break;
        }
      }
    } catch (e) {
      console.warn('PS3 Wikipedia cover lookup:', e);
    }

    cache[key] = { at: Date.now(), url };
    cacheWrite(cache);
    return url;
  }

  function titleOf(container) {
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
    const title = titleOf(container);
    if (!title) return;
    const url = await resolve(title);
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
      container.dataset.coverSource = 'wikipedia-ps3-fallback';
    };
    img.src = url;
  }

  async function pump() {
    if (working || document.hidden) return;
    working = true;
    try {
      while (queue.length && !document.hidden) {
        const el = queue.shift();
        try { await enhance(el); }
        finally { if (el) el.dataset.ps3WikiQueued = ''; }
        await new Promise(r => setTimeout(r, 0));
      }
    } finally {
      working = false;
    }
  }

  function scan() {
    for (const el of document.querySelectorAll('.cover, .detail-cover, .mini-cover, .playing-cover')) {
      if (!(el instanceof HTMLElement) || el.querySelector('img') || el.dataset.ps3WikiQueued === '1') continue;
      const badge = el.querySelector('.cover-platform-badge');
      if (!badge || badge.textContent.trim().toLowerCase() !== 'ps3') continue;
      el.dataset.ps3WikiQueued = '1';
      queue.push(el);
    }
    pump();
  }

  function schedule(delay = 350) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const run = () => scan();
      if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 800 });
      else setTimeout(run, 0);
    }, delay);
  }

  window.addEventListener('load', () => schedule(500));
  window.addEventListener('pageshow', () => schedule(400));
  document.addEventListener('click', () => schedule(250));
  document.addEventListener('change', () => schedule(250));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(400); });
  setInterval(() => { if (!document.hidden) schedule(0); }, 15_000);
})();
