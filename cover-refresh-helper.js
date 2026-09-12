/* Memory Card — reliable bulk cover refresh v3
   Cover recovery order:
   - Vita: VitaDB title mapping -> HexFlow/aldostools -> Libretro -> Wikipedia infobox
   - PS3/PSP: aldostools title-id mapping -> Libretro -> Wikipedia infobox
   - Nintendo/Switch: Libretro where available -> Wikipedia infobox
*/
(() => {
  const DB_NAME = 'memory-card-db';
  const STORE = 'state';
  const MAIN_KEY = 'main';
  const CATALOG_KEY = 'catalog-v1';

  const TITLE_DB_KEY = 'aldostools-titleid-v1';
  const TITLE_DB_URL = 'https://raw.githubusercontent.com/aldostools/Resources/main/titleid.txt';
  const TITLE_DB_TTL = 1000 * 60 * 60 * 24 * 14;

  const VITA_DB_KEY = 'vita-title-db-v1';
  const VITA_DB_URL = 'https://raw.githubusercontent.com/VitaSmith/VitaDB/master/VitaDB.sql';
  const VITA_DB_TTL = 1000 * 60 * 60 * 24 * 30;
  const VITA_HEXFLOW_BASE = 'https://raw.githubusercontent.com/Andiweli/HexFlow-Covers/main/Covers/PSVita/';

  const LIBRETRO_REPOS = {
    PSP: ['Sony_-_PlayStation_Portable'],
    VITA: ['Sony_-_PlayStation_Vita'],
    DSI: ['Nintendo_-_Nintendo_DS', 'Nintendo_-_Nintendo_DSi'],
    '3DS': ['Nintendo_-_Nintendo_3DS'],
    GBA: ['Nintendo_-_Game_Boy_Advance'],
    PS3: ['Sony_-_PlayStation_3', 'Sony_-_PlayStation_3_Downloadable'],
    WIIU: ['Nintendo_-_Wii_U'],
  };

  const SONY_URLS = {
    PS3: id => [
      `https://raw.githubusercontent.com/aldostools/Resources/main/COV/${id}.JPG`,
      `https://raw.githubusercontent.com/aldostools/Resources/main/COV/${id}.PNG`,
    ],
    PSP: id => [
      `https://raw.githubusercontent.com/aldostools/Resources/main/PSP/${id}.PNG`,
      `https://raw.githubusercontent.com/aldostools/Resources/main/PSP/${id}.JPG`,
    ],
    VITA: id => [
      `${VITA_HEXFLOW_BASE}${encodeURIComponent(id)}.png`,
      `https://raw.githubusercontent.com/aldostools/Resources/main/PSVITA/${id}.PNG`,
      `https://raw.githubusercontent.com/aldostools/Resources/main/PSVITA/${id}.JPG`,
    ],
  };

  const WIKI_ALIASES = [
    [/^metal gear solid 2 sons of liberty(?: hd)?$/, 'Metal Gear Solid HD Collection'],
    [/^metal gear solid 3 snake eater(?: hd)?$/, 'Metal Gear Solid HD Collection'],
    [/^metal gear solid hd collection$/, 'Metal Gear Solid HD Collection'],
    [/^resistance burning skies$/, 'Resistance: Burning Skies'],
  ];

  let running = false;
  let titleDbPromise = null;
  let vitaDbPromise = null;
  const libretroIndexPromises = new Map();

  const normalize = value => String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[™®©]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9а-яё]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const simplify = value => normalize(value)
    .replace(/\b(playstation|psvita|vita|psp|psone|ps2|ps3|ps4|demo|trial|mini)\b/g, ' ')
    .replace(/\b(game of the year|goty|ultimate|remastered|remaster|edition|version)\b/g, ' ')
    .replace(/\bhd\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getValue(key, fallback = null) {
    const db = await openDb();
    return new Promise(resolve => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? fallback);
      req.onerror = () => resolve(fallback);
    });
  }

  async function putValues(entries) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const [key, value] of entries) store.put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  function ensureProgress() {
    let el = document.querySelector('#taskProgress');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'taskProgress';
    el.className = 'task-progress visible';
    el.innerHTML = '<div class="task-progress-head"><span data-task-label>Обложки</span><b data-task-percent>0%</b></div><div class="task-progress-track"><i data-task-bar></i></div><div class="task-progress-detail" data-task-detail></div>';
    document.body.appendChild(el);
    return el;
  }

  function progress(label, current, total, detail = '') {
    const el = ensureProgress();
    const t = Math.max(1, Number(total) || 1);
    const c = Math.max(0, Math.min(t, Number(current) || 0));
    const pct = Math.round(c / t * 100);
    el.hidden = false;
    el.classList.remove('error');
    el.classList.add('visible');
    el.querySelector('[data-task-label]').textContent = label;
    el.querySelector('[data-task-percent]').textContent = `${pct}%`;
    el.querySelector('[data-task-bar]').style.width = `${pct}%`;
    el.querySelector('[data-task-detail]').textContent = detail;
  }

  function finish(label, detail = '') {
    progress(label, 100, 100, detail);
  }

  function fail(message) {
    const el = ensureProgress();
    el.hidden = false;
    el.classList.add('visible', 'error');
    el.querySelector('[data-task-label]').textContent = 'Ошибка обновления обложек';
    el.querySelector('[data-task-percent]').textContent = '!';
    el.querySelector('[data-task-bar]').style.width = '100%';
    el.querySelector('[data-task-detail]').textContent = message || 'Неизвестная ошибка';
  }

  function imageWorks(url, timeoutMs = 3600) {
    return new Promise(resolve => {
      if (!/^https?:\/\//i.test(String(url || ''))) return resolve(false);
      const img = new Image();
      let done = false;
      const end = ok => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        img.onload = null;
        img.onerror = null;
        resolve(Boolean(ok));
      };
      const timer = setTimeout(() => end(false), timeoutMs);
      img.onload = () => end(img.naturalWidth > 40 && img.naturalHeight > 40);
      img.onerror = () => end(false);
      img.referrerPolicy = 'no-referrer';
      img.src = String(url);
    });
  }

  function titleScore(candidate, wanted) {
    if (!candidate || !wanted) return 999;
    if (candidate === wanted) return 0;
    if (candidate.startsWith(wanted) || wanted.startsWith(candidate)) return 5 + Math.abs(candidate.length - wanted.length) / 9;
    if (candidate.includes(wanted) || wanted.includes(candidate)) return 10 + Math.abs(candidate.length - wanted.length) / 7;
    const a = new Set(candidate.split(' ').filter(Boolean));
    const b = new Set(wanted.split(' ').filter(Boolean));
    const common = [...b].filter(x => a.has(x)).length;
    const union = new Set([...a, ...b]).size || 1;
    return 100 - common / union * 84 + Math.abs(a.size - b.size) * 2;
  }

  function sonyPlatformForEntry(id, rawTitle) {
    const title = String(rawTitle || '');
    if (/\[PSVita\]/i.test(title) || /^PC[A-Z]{2}\d{5}$/i.test(id)) return 'VITA';
    if (/\[PSP\]/i.test(title) || /^(UL|UC|NP[EUJH]H|NPJG|NPJH)/i.test(id)) return 'PSP';
    if (/\[(?:PSOne|PS2|PS4)\]/i.test(title)) return '';
    if (/^(BL|BC|NP[EUJH][AB]|NPEA|NPUA|NPJA|NPHA)/i.test(id)) return 'PS3';
    return '';
  }

  function cleanDbTitle(rawTitle) {
    return String(rawTitle || '')
      .replace(/\[(PSVita|PSP|PSOne|PS2|PS4)\]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function indexItems(items) {
    const exact = new Map();
    for (const item of items) {
      const bucket = exact.get(item.key) || [];
      bucket.push(item);
      exact.set(item.key, bucket);
    }
    return exact;
  }

  async function loadTitleDb() {
    if (titleDbPromise) return titleDbPromise;
    titleDbPromise = (async () => {
      const cached = await getValue(TITLE_DB_KEY, null);
      const age = cached?.updatedAt ? Date.now() - new Date(cached.updatedAt).getTime() : Infinity;
      let text = cached?.text || '';
      if (!text || age > TITLE_DB_TTL) {
        const response = await fetch(TITLE_DB_URL, { cache: 'no-store' });
        if (!response.ok) {
          if (!text) throw new Error(`База Title ID: HTTP ${response.status}`);
        } else {
          text = await response.text();
          await putValues([[TITLE_DB_KEY, { updatedAt: new Date().toISOString(), text }]]);
        }
      }
      const byPlatform = { PS3: [], VITA: [], PSP: [] };
      const exact = { PS3: new Map(), VITA: new Map(), PSP: new Map() };
      for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9]{8,12})\s+(.+)$/);
        if (!m) continue;
        const id = m[1].trim();
        const rawTitle = m[2].trim();
        const platform = sonyPlatformForEntry(id, rawTitle);
        if (!platform) continue;
        const title = cleanDbTitle(rawTitle);
        const key = normalize(title);
        if (!key) continue;
        const item = { id, title, rawTitle, key, simple: simplify(title), demo: /\b(?:demo|trial|beta)\b/i.test(rawTitle) };
        byPlatform[platform].push(item);
        const bucket = exact[platform].get(key) || [];
        bucket.push(item);
        exact[platform].set(key, bucket);
      }
      return { byPlatform, exact };
    })();
    try { return await titleDbPromise; }
    catch (e) { titleDbPromise = null; throw e; }
  }

  async function loadVitaDb() {
    if (vitaDbPromise) return vitaDbPromise;
    vitaDbPromise = (async () => {
      const cached = await getValue(VITA_DB_KEY, null);
      const age = cached?.updatedAt ? Date.now() - new Date(cached.updatedAt).getTime() : Infinity;
      let items = Array.isArray(cached?.items) ? cached.items : [];
      if (!items.length || age > VITA_DB_TTL) {
        const response = await fetch(VITA_DB_URL, { cache: 'no-store' });
        if (!response.ok) {
          if (!items.length) throw new Error(`VitaDB: HTTP ${response.status}`);
        } else {
          const sql = await response.text();
          const parsed = [];
          const seen = new Set();
          const re = /INSERT INTO Apps VALUES\('([A-Z0-9]{8,12})','((?:''|[^'])*)'/g;
          let m;
          while ((m = re.exec(sql))) {
            const id = m[1].trim();
            if (!/^PC[A-Z]{2}\d{5}$/i.test(id)) continue;
            const title = m[2].replace(/''/g, "'").replace(/\s+/g, ' ').trim();
            const key = normalize(title);
            if (!key) continue;
            const dedupe = `${id}|${key}`;
            if (seen.has(dedupe)) continue;
            seen.add(dedupe);
            parsed.push({ id, title, key, simple: simplify(title), demo: /\b(?:demo|trial|beta)\b/i.test(title) });
          }
          if (parsed.length) {
            items = parsed;
            await putValues([[VITA_DB_KEY, { updatedAt: new Date().toISOString(), items }]]);
          }
        }
      }
      return { items, exact: indexItems(items) };
    })();
    try { return await vitaDbPromise; }
    catch (e) { vitaDbPromise = null; throw e; }
  }

  function regionRank(id, platform) {
    const x = String(id || '').toUpperCase();
    if (platform === 'PS3') {
      if (/^(BLUS|BCUS|NPUB|NPUA)/.test(x)) return 0;
      if (/^(BLES|BCES|NPEB|NPEA)/.test(x)) return 1;
      if (/^(BLAS|BCAS|NPHB|NPHA)/.test(x)) return 2;
      if (/^(BLJM|BCJS|NPJB|NPJA)/.test(x)) return 4;
      return 3;
    }
    if (platform === 'VITA') {
      if (/^(PCSA|PCSE)/.test(x)) return 0;
      if (/^(PCSB|PCSF)/.test(x)) return 1;
      if (/^PCSH/.test(x)) return 2;
      if (/^(PCSC|PCSG)/.test(x)) return 4;
      return 3;
    }
    if (platform === 'PSP') {
      if (/^(ULUS|UCUS|NPUH)/.test(x)) return 0;
      if (/^(ULES|UCES|NPEH)/.test(x)) return 1;
      if (/^(ULJM|ULJS|NPJH)/.test(x)) return 4;
      return 3;
    }
    return 3;
  }

  function scoreCandidates(items, exact, game, platform, threshold = 23) {
    const wanted = normalize(game.title);
    const simpleWanted = simplify(game.title);
    const direct = exact?.get(wanted) || [];
    const scored = direct.map(x => ({ ...x, score: 0 }));
    if (!scored.length) {
      const tokens = simpleWanted.split(' ').filter(x => x.length > 2);
      const anchor = tokens[0] || simpleWanted.split(' ')[0] || '';
      const pool = (items || []).filter(x => !anchor || x.simple.includes(anchor));
      for (const item of pool) {
        const score = Math.min(titleScore(item.key, wanted), titleScore(item.simple, simpleWanted));
        if (score <= threshold) scored.push({ ...item, score });
      }
    }
    scored.sort((a, b) => Number(a.demo) - Number(b.demo) || a.score - b.score || regionRank(a.id, platform) - regionRank(b.id, platform));
    const unique = [];
    const seen = new Set();
    for (const item of scored) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      unique.push(item);
      if (unique.length >= 12) break;
    }
    return unique;
  }

  function candidateTitleIds(db, game) {
    const platform = game.platform;
    if (!SONY_URLS[platform]) return [];
    return scoreCandidates(db.byPlatform[platform] || [], db.exact[platform], game, platform, 24);
  }

  async function resolveSony(game) {
    if (!SONY_URLS[game.platform]) return null;
    let db;
    try { db = await loadTitleDb(); }
    catch (e) { console.warn('Title ID database unavailable', e); return null; }
    const ids = candidateTitleIds(db, game);
    for (const item of ids) {
      for (const url of SONY_URLS[game.platform](item.id)) {
        if (await imageWorks(url, 3000)) return { url, source: `aldostools:${game.platform}:${item.id}`, matchedTitle: item.title };
      }
    }
    return null;
  }

  async function resolveVita(game) {
    const candidates = [];
    const seen = new Set();
    try {
      const db = await loadVitaDb();
      for (const item of scoreCandidates(db.items, db.exact, game, 'VITA', 20)) {
        if (!seen.has(item.id)) { seen.add(item.id); candidates.push(item); }
      }
    } catch (e) { console.warn('VitaDB unavailable', e); }

    try {
      const titleDb = await loadTitleDb();
      for (const item of candidateTitleIds(titleDb, { ...game, platform: 'VITA' })) {
        if (!seen.has(item.id)) { seen.add(item.id); candidates.push(item); }
      }
    } catch (e) { console.warn('Title ID database unavailable for Vita', e); }

    for (const item of candidates.slice(0, 14)) {
      const urls = SONY_URLS.VITA(item.id);
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        if (await imageWorks(url, 3000)) {
          const source = i === 0 ? `hexflow-vita:${item.id}` : `aldostools:VITA:${item.id}`;
          return { url, source, matchedTitle: item.title };
        }
      }
    }
    return null;
  }

  function stripCoverTags(value = '') {
    return String(value)
      .replace(/\.[a-z0-9]{2,5}$/i, '')
      .replace(/\s*[\[(](?:USA|Europe|Japan|World|Australia|Korea|Asia|En(?:,[A-Za-z]+)*|Rev[^\])]*|Disc[^\])]*|Disk[^\])]*|v\d[^\])]*)[\])]/gi, ' ')
      .replace(/\s*[\[(][^\])]*(?:Proto|Beta|Demo|Sample|Unl|Virtual Console|PSN)[^\])]*[\])]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function regionPenalty(path = '') {
    if (/\(USA\)|\(World\)/i.test(path)) return 0;
    if (/\(Europe\)/i.test(path)) return 1;
    if (/\(Australia\)/i.test(path)) return 2;
    if (/\(Japan\)/i.test(path)) return 6;
    return 3;
  }

  async function libretroIndex(repo) {
    if (libretroIndexPromises.has(repo)) return libretroIndexPromises.get(repo);
    const job = (async () => {
      const key = `libretro-index:${repo}`;
      const cached = await getValue(key, null);
      if (Array.isArray(cached?.paths) && cached.paths.length) return cached.paths;
      const response = await fetch(`https://api.github.com/repos/libretro-thumbnails/${repo}/git/trees/master?recursive=1`, { headers: { Accept: 'application/vnd.github+json' } });
      if (!response.ok) throw new Error(`Libretro ${repo}: HTTP ${response.status}`);
      const data = await response.json();
      const paths = (data.tree || []).filter(x => x.type === 'blob' && /^Named_Boxarts\/.+\.(png|jpe?g|webp)$/i.test(x.path || '')).map(x => x.path);
      if (paths.length) await putValues([[key, { updatedAt: new Date().toISOString(), paths }]]);
      return paths;
    })();
    libretroIndexPromises.set(repo, job);
    try { return await job; }
    catch (e) { libretroIndexPromises.delete(repo); throw e; }
  }

  function libretroUrl(repo, path) {
    const encoded = String(path).split('/').map(encodeURIComponent).join('/');
    return `https://raw.githubusercontent.com/libretro-thumbnails/${repo}/master/${encoded}`;
  }

  async function resolveLibretro(game) {
    const repos = LIBRETRO_REPOS[game.platform] || [];
    const candidates = [];
    for (const repo of repos) {
      try {
        const paths = await libretroIndex(repo);
        for (const path of paths) {
          const filename = path.split('/').pop() || '';
          const score = titleScore(simplify(stripCoverTags(filename)), simplify(game.title)) + regionPenalty(path);
          if (score <= 29) candidates.push({ repo, path, filename, score });
        }
      } catch (e) { console.warn('Libretro cover index', repo, e); }
    }
    candidates.sort((a, b) => a.score - b.score || a.filename.length - b.filename.length);
    for (const candidate of candidates.slice(0, 8)) {
      const url = libretroUrl(candidate.repo, candidate.path);
      if (await imageWorks(url, 3000)) return { url, source: `libretro:${candidate.repo}`, matchedTitle: stripCoverTags(candidate.filename) };
    }
    return null;
  }

  function wikiAlias(title) {
    const key = simplify(title);
    return WIKI_ALIASES.find(([rx]) => rx.test(key))?.[1] || '';
  }

  function wikiTitleScore(pageTitle, gameTitle) {
    const a = simplify(String(pageTitle || '').replace(/\([^)]*\)/g, ' '));
    const b = simplify(gameTitle);
    if (!a || !b) return 99;
    if (a === b) return 0;
    if (a.startsWith(b) || b.startsWith(a)) return 2;
    if (a.includes(b) || b.includes(a)) return 5;
    const aa = new Set(a.split(' ').filter(Boolean));
    const bb = new Set(b.split(' ').filter(Boolean));
    const common = [...bb].filter(x => aa.has(x)).length;
    return 16 - Math.min(12, common * 3);
  }

  async function infoboxImage(pageTitle) {
    try {
      const url = `https://en.wikipedia.org/w/api.php?action=parse&format=json&origin=*&page=${encodeURIComponent(pageTitle)}&prop=text`;
      const response = await fetch(url);
      if (!response.ok) return '';
      const data = await response.json();
      const html = data?.parse?.text?.['*'] || '';
      if (!html) return '';
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const bad = /\b(logo|icon|screenshot|gameplay|map|symbol|wordmark|developer|director|producer|composer|portrait|photo|character)\b/i;
      const good = /\b(cover|box|boxart|box art|packaging|front cover|game cover)\b/i;
      const options = [...doc.querySelectorAll('table.infobox img')].map((img, index) => {
        const raw = img.getAttribute('src') || '';
        const srcset = img.getAttribute('srcset') || '';
        let chosen = raw;
        const parts = srcset.split(',').map(x => x.trim().split(/\s+/)[0]).filter(Boolean);
        if (parts.length) chosen = parts[parts.length - 1];
        if (chosen.startsWith('//')) chosen = `https:${chosen}`;
        const meta = `${img.getAttribute('alt') || ''} ${img.closest('a')?.getAttribute('title') || ''} ${img.closest('a')?.getAttribute('href') || ''} ${chosen}`;
        const width = Number(img.getAttribute('width') || 0);
        const height = Number(img.getAttribute('height') || 0);
        let score = index * 2;
        if (good.test(meta)) score -= 20;
        if (bad.test(meta)) score += 40;
        if (width && height) {
          const ratio = height / width;
          if (ratio >= 1.05 && ratio <= 1.9) score -= 6;
          else if (ratio < .85) score += 10;
        }
        return { url: chosen, score, meta };
      }).filter(x => /^https?:\/\//i.test(x.url) && !bad.test(x.meta)).sort((a, b) => a.score - b.score);
      for (const option of options.slice(0, 3)) {
        if (option.score <= 12 && await imageWorks(option.url, 3200)) return option.url;
      }
    } catch (e) { console.warn('Wikipedia infobox cover', e); }
    return '';
  }

  async function resolveWikipedia(game) {
    const alias = wikiAlias(game.title);
    if (alias) {
      const url = await infoboxImage(alias);
      if (url) return { url, source: 'wikipedia-infobox-refresh' };
    }
    const queries = game.platform === 'VITA'
      ? [`intitle:"${game.title}" PlayStation Vita`, `intitle:"${game.title}" video game`, `"${game.title}" video game`]
      : [`intitle:"${game.title}" video game`, `"${game.title}" video game`];
    for (const query of queries) {
      try {
        const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=0&gsrlimit=6&gsrsearch=${encodeURIComponent(query)}`;
        const response = await fetch(url);
        if (!response.ok) continue;
        const data = await response.json();
        const pages = Object.values(data.query?.pages || {}).sort((a, b) => wikiTitleScore(a.title, game.title) - wikiTitleScore(b.title, game.title));
        for (const page of pages.slice(0, 3)) {
          if (wikiTitleScore(page.title, game.title) > 7) continue;
          const image = await infoboxImage(page.title);
          if (image) return { url: image, source: 'wikipedia-infobox-refresh' };
        }
      } catch (e) { console.warn('Wikipedia cover search', e); }
    }
    return null;
  }

  async function resolveCover(game) {
    if (game.platform === 'VITA') {
      const vita = await resolveVita(game);
      if (vita) return vita;
    } else if (game.platform === 'PS3' || game.platform === 'PSP') {
      const sony = await resolveSony(game);
      if (sony) return sony;
    }
    const libretro = await resolveLibretro(game);
    if (libretro) return libretro;
    return resolveWikipedia(game);
  }

  async function mapLimit(items, limit, worker) {
    let next = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        await worker(items[index], index);
      }
    });
    await Promise.all(runners);
  }

  async function runRefresh(button) {
    if (running) return;
    running = true;
    const wasDisabled = button?.disabled;
    if (button) button.disabled = true;
    try {
      const main = await getValue(MAIN_KEY, null);
      if (!main || !Array.isArray(main.games)) throw new Error('Не удалось прочитать локальную библиотеку');
      const games = main.games.filter(g => g && !g.deletedAt);
      if (!games.length) { finish('Обложки', 'В библиотеке пока нет игр'); return; }

      const missing = [];
      let checked = 0;
      progress('Проверяю сохранённые обложки', 0, games.length, `0 из ${games.length}`);
      await mapLimit(games, 6, async game => {
        const url = String(game.coverUrl || '').trim();
        const valid = url ? await imageWorks(url, 2600) : false;
        if (!valid) missing.push(game);
        checked++;
        progress('Проверяю сохранённые обложки', checked, games.length, `${checked} из ${games.length} · отсутствует/сломано: ${missing.length}`);
      });

      if (!missing.length) {
        finish('Обложки проверены', `${games.length} из ${games.length} работают`);
        return;
      }

      const missingVita = missing.filter(g => g.platform === 'VITA').length;
      if (missingVita) {
        progress('Готовлю базу Vita', 0, 1, `Для ${missingVita} игр загружаю VitaDB и индекс Title ID…`);
        await Promise.allSettled([loadVitaDb(), loadTitleDb()]);
      } else if (missing.some(g => SONY_URLS[g.platform])) {
        progress('Готовлю базу Sony', 0, 1, 'Загружаю индекс Title ID…');
        try { await loadTitleDb(); } catch (e) { console.warn(e); }
      }

      let done = 0;
      let found = 0;
      const foundByPlatform = {};
      const sourceCounts = {};
      progress('Ищу отсутствующие обложки', 0, missing.length, `0 из ${missing.length} · найдено: 0`);

      await mapLimit(missing, 2, async game => {
        let resolved = null;
        try { resolved = await resolveCover(game); }
        catch (e) { console.warn('Cover resolver failed', game.title, e); }
        if (resolved?.url) {
          game.coverUrl = resolved.url;
          game.coverSource = resolved.source || 'cover-refresh-v3';
          game.updatedAt = new Date().toISOString();
          found++;
          foundByPlatform[game.platform] = (foundByPlatform[game.platform] || 0) + 1;
          const source = String(resolved.source || 'other').split(':')[0];
          sourceCounts[source] = (sourceCounts[source] || 0) + 1;
        } else if (game.coverUrl && !(await imageWorks(game.coverUrl, 1800))) {
          game.coverUrl = '';
          game.coverSource = '';
        }
        done++;
        progress('Ищу отсутствующие обложки', done, missing.length, `${done} из ${missing.length} · найдено: ${found} · ${game.title}`);
      });

      const catalogState = await getValue(CATALOG_KEY, { catalog: [], catalogMeta: {} });
      const catalog = Array.isArray(catalogState?.catalog) ? catalogState.catalog : [];
      for (const game of games) {
        if (!game.coverUrl) continue;
        const key = normalize(game.title);
        for (const entry of catalog) {
          if (entry?.platform === game.platform && normalize(entry.title) === key) {
            entry.coverUrl = game.coverUrl;
            entry.coverSource = game.coverSource || '';
          }
        }
      }
      main.games = main.games.map(original => games.find(g => g.id === original.id) || original);
      await putValues([
        [MAIN_KEY, main],
        [CATALOG_KEY, { ...catalogState, catalog }],
      ]);

      const platformSummary = Object.entries(foundByPlatform).map(([p, n]) => `${p}: +${n}`).join(' · ');
      const sourceSummary = Object.entries(sourceCounts).map(([s, n]) => `${s} ${n}`).join(' · ');
      finish(found ? 'Новые обложки найдены' : 'Новых обложек не найдено', `${found} из ${missing.length}${platformSummary ? ` · ${platformSummary}` : ''}${sourceSummary ? ` · ${sourceSummary}` : ''}`);
      if (found) setTimeout(() => location.reload(), 900);
    } catch (e) {
      console.error(e);
      fail(e?.message || String(e));
    } finally {
      running = false;
      if (button) button.disabled = Boolean(wasDisabled);
    }
  }

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('[data-action="covers-refresh"]') : null;
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    runRefresh(target);
  }, true);
})();