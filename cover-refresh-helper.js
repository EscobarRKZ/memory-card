
(() => {
  const DB_NAME = 'memory-card-db';
  const STORE = 'state';
  const MAIN_KEY = 'main';
  const CATALOG_KEY = 'catalog-v1';
  const TREE_TTL = 1000 * 60 * 60 * 24 * 30;

  const TITLE_DB_KEY = 'aldostools-titleid-v1';
  const TITLE_DB_URL = 'https://raw.githubusercontent.com/aldostools/Resources/main/titleid.txt';
  const TITLE_DB_TTL = 1000 * 60 * 60 * 24 * 14;

  const VITA_DB_KEY = 'vita-title-db-v1';
  const VITA_DB_URL = 'https://raw.githubusercontent.com/VitaSmith/VitaDB/master/VitaDB.sql';
  const VITA_DB_TTL = 1000 * 60 * 60 * 24 * 30;

  const SWITCH_DB_KEY = 'switch-title-db-v15';
  const SWITCH_DB_URL = 'https://www.gametdb.com/switchtdb.txt?LANG=EN';
  const SWITCH_DB_TTL = 1000 * 60 * 60 * 24 * 7;

  const COVER_TREES = {
    PS3_ALDO: {
      key: 'cover-tree:aldo-ps3-v1',
      api: 'https://api.github.com/repos/aldostools/Resources/git/trees/d715353f141b5ab2d7051602e6a6332ea7d96e22?recursive=1',
      base: 'https://raw.githubusercontent.com/aldostools/Resources/main/COV/',
    },
    PSP_ALDO: {
      key: 'cover-tree:aldo-psp-v1',
      api: 'https://api.github.com/repos/aldostools/Resources/git/trees/4b9732667423a0e1892aee3cd7a7b1fd70b13fdf?recursive=1',
      base: 'https://raw.githubusercontent.com/aldostools/Resources/main/PSP/',
    },
    VITA_ALDO: {
      key: 'cover-tree:aldo-vita-v1',
      api: 'https://api.github.com/repos/aldostools/Resources/git/trees/42664e60142d0980eda48fccfb0aaf687cd9a872?recursive=1',
      base: 'https://raw.githubusercontent.com/aldostools/Resources/main/PSVITA/',
    },
    VITA_HEX: {
      key: 'cover-tree:hexflow-vita-v1',
      api: 'https://api.github.com/repos/Andiweli/HexFlow-Covers/git/trees/974a6382d8abda667dd1dcac3e7cb0219cffdf64?recursive=1',
      base: 'https://raw.githubusercontent.com/Andiweli/HexFlow-Covers/main/Covers/PSVita/',
    },
  };

  const FALLBACK_LIBRETRO = {
    PSP: ['Sony_-_PlayStation_Portable'],
    VITA: ['Sony_-_PlayStation_Vita'],
    DSI: ['Nintendo_-_Nintendo_DS', 'Nintendo_-_Nintendo_DSi'],
    '3DS': ['Nintendo_-_Nintendo_3DS'],
    GBA: ['Nintendo_-_Game_Boy_Advance'],
    PS1: ['Sony_-_PlayStation'],
    PS2: ['Sony_-_PlayStation_2'],
    PS3: ['Sony_-_PlayStation_3', 'Sony_-_PlayStation_3_Downloadable'],
    PS4: ['Sony_-_PlayStation_4'],
    XBOX: ['Microsoft_-_Xbox'],
    X360: ['Microsoft_-_Xbox_360'],
    WII: ['Nintendo_-_Wii'],
    WIIU: ['Nintendo_-_Wii_U'],
    GC: ['Nintendo_-_GameCube'],
    DREAMCAST: ['Sega_-_Dreamcast'],
    N64: ['Nintendo_-_Nintendo_64'],
    SNES: ['Nintendo_-_Super_Nintendo_Entertainment_System'],
    NES: ['Nintendo_-_Nintendo_Entertainment_System'],
    GENESIS: ['Sega_-_Mega_Drive_-_Genesis'],
  };
  const LIBRETRO_REPOS = window.MemoryCardCoverSources?.libretroRepos || FALLBACK_LIBRETRO;

  let running = false;
  let progressHideTimer = null;
  let titleDbPromise = null;
  let vitaDbPromise = null;
  let switchDbPromise = null;
  const coverTreePromises = new Map();
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
    .replace(/\b(playstation|psvita|vita|psp|psone|ps2|ps3|ps4|ps5|xbox series|xbox one|xbox|demo|trial|mini)\b/g, ' ')
    .replace(/\b(game of the year|goty|ultimate|deluxe|complete|remastered|remaster|edition|version)\b/g, ' ')
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
    try {
      return await new Promise(resolve => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result ?? fallback);
        req.onerror = () => resolve(fallback);
      });
    } finally { db.close(); }
  }

  async function putValues(entries) {
    const db = await openDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        for (const [key, value] of entries) store.put(value, key);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
      });
    } finally { db.close(); }
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
    clearTimeout(progressHideTimer);
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

  function hideProgressAfter(ms = 4200) {
    clearTimeout(progressHideTimer);
    progressHideTimer = setTimeout(() => {
      const el = document.querySelector('#taskProgress');
      if (!el) return;
      el.classList.remove('visible', 'error');
      setTimeout(() => { el.hidden = true; }, 220);
    }, ms);
  }

  function finish(label, detail = '') {
    progress(label, 100, 100, detail);
    hideProgressAfter();
  }

  function fail(message) {
    clearTimeout(progressHideTimer);
    const el = ensureProgress();
    el.hidden = false;
    el.classList.add('visible', 'error');
    el.querySelector('[data-task-label]').textContent = 'Ошибка обновления обложек';
    el.querySelector('[data-task-percent]').textContent = '!';
    el.querySelector('[data-task-bar]').style.width = '100%';
    el.querySelector('[data-task-detail]').textContent = message || 'Неизвестная ошибка';
    hideProgressAfter(6500);
  }

  function imageWorks(url, timeoutMs = 3200) {
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

  function indexItems(items) {
    const exact = new Map();
    for (const item of items) {
      const bucket = exact.get(item.key) || [];
      bucket.push(item);
      exact.set(item.key, bucket);
    }
    return exact;
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
    catch (error) { titleDbPromise = null; throw error; }
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
    catch (error) { vitaDbPromise = null; throw error; }
  }

  function regionRank(id, platform) {
    const x = String(id || '').toUpperCase();
    if (platform === 'PS3') {
      if (/^(BLUS|BCUS|NPUB|NPUA)/.test(x)) return 0;
      if (/^(BLES|BCES|NPEB|NPEA)/.test(x)) return 1;
      if (/^(BLAS|BCAS|NPHB|NPHA)/.test(x)) return 2;
      if (/^(BLJM|BCJS|NPJB|NPJA)/.test(x)) return 4;
    }
    if (platform === 'VITA') {
      if (/^(PCSA|PCSE)/.test(x)) return 0;
      if (/^(PCSB|PCSF)/.test(x)) return 1;
      if (/^PCSH/.test(x)) return 2;
      if (/^(PCSC|PCSG)/.test(x)) return 4;
    }
    if (platform === 'PSP') {
      if (/^(ULUS|UCUS|NPUH)/.test(x)) return 0;
      if (/^(ULES|UCES|NPEH)/.test(x)) return 1;
      if (/^(ULJM|ULJS|NPJH)/.test(x)) return 4;
    }
    return 3;
  }

  function scoreCandidates(items, exact, game, platform, threshold = 23) {
    const wanted = normalize(game.title);
    const simpleWanted = simplify(game.title);
    const direct = exact?.get(wanted) || [];
    const scored = direct.map(item => ({ ...item, score: 0 }));
    if (!scored.length) {
      const tokens = simpleWanted.split(' ').filter(token => token.length > 2);
      const anchor = tokens[0] || simpleWanted.split(' ')[0] || '';
      const pool = (items || []).filter(item => !anchor || item.simple.includes(anchor));
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
      if (unique.length >= 14) break;
    }
    return unique;
  }

  function candidateTitleIds(db, game) {
    if (!['PS3', 'VITA', 'PSP'].includes(game.platform)) return [];
    return scoreCandidates(db.byPlatform[game.platform] || [], db.exact[game.platform], game, game.platform, 24);
  }

  async function loadCoverTree(name) {
    if (coverTreePromises.has(name)) return coverTreePromises.get(name);
    const def = COVER_TREES[name];
    if (!def) return { def: null, paths: new Map() };
    const job = (async () => {
      const cached = await getValue(def.key, null);
      const age = cached?.updatedAt ? Date.now() - new Date(cached.updatedAt).getTime() : Infinity;
      let paths = Array.isArray(cached?.paths) ? cached.paths : [];
      if (!paths.length || age > TREE_TTL) {
        const response = await fetch(def.api, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
        if (!response.ok) {
          if (!paths.length) throw new Error(`${name}: HTTP ${response.status}`);
        } else {
          const data = await response.json();
          const fresh = (data.tree || [])
            .filter(item => item.type === 'blob' && /\.(png|jpe?g|webp)$/i.test(item.path || ''))
            .map(item => item.path);
          if (fresh.length) {
            paths = fresh;
            await putValues([[def.key, { updatedAt: new Date().toISOString(), paths }]]);
          }
        }
      }
      const map = new Map();
      for (const path of paths) map.set(String(path).toUpperCase(), path);
      return { def, paths: map };
    })();
    coverTreePromises.set(name, job);
    try { return await job; }
    catch (error) { coverTreePromises.delete(name); throw error; }
  }

  function exactTreeCover(tree, id) {
    if (!tree?.def || !tree?.paths || !id) return '';
    const stem = String(id).trim().toUpperCase();
    for (const ext of ['.PNG', '.JPG', '.JPEG', '.WEBP']) {
      const actual = tree.paths.get(`${stem}${ext}`);
      if (actual) return tree.def.base + actual.split('/').map(encodeURIComponent).join('/');
    }
    return '';
  }

  async function resolveVita(game) {
    const candidates = [];
    const seen = new Set();
    try {
      const db = await loadVitaDb();
      for (const item of scoreCandidates(db.items, db.exact, game, 'VITA', 21)) {
        if (!seen.has(item.id)) { seen.add(item.id); candidates.push(item); }
      }
    } catch (error) { console.warn('VitaDB unavailable', error); }
    try {
      const db = await loadTitleDb();
      for (const item of candidateTitleIds(db, { ...game, platform: 'VITA' })) {
        if (!seen.has(item.id)) { seen.add(item.id); candidates.push(item); }
      }
    } catch (error) { console.warn('Title ID database unavailable for Vita', error); }

    let hex = null;
    let aldo = null;
    try { [hex, aldo] = await Promise.all([loadCoverTree('VITA_HEX'), loadCoverTree('VITA_ALDO')]); }
    catch (error) { console.warn('Vita cover trees unavailable', error); }
    for (const item of candidates) {
      const hexUrl = exactTreeCover(hex, item.id);
      if (hexUrl) return { url: hexUrl, source: `hexflow-vita:${item.id}`, matchedTitle: item.title };
      const aldoUrl = exactTreeCover(aldo, item.id);
      if (aldoUrl) return { url: aldoUrl, source: `aldostools:VITA:${item.id}`, matchedTitle: item.title };
    }
    return null;
  }

  async function resolveAldoSony(game) {
    const treeName = game.platform === 'PS3' ? 'PS3_ALDO' : game.platform === 'PSP' ? 'PSP_ALDO' : '';
    if (!treeName) return null;
    try {
      const [db, tree] = await Promise.all([loadTitleDb(), loadCoverTree(treeName)]);
      for (const item of candidateTitleIds(db, game)) {
        const url = exactTreeCover(tree, item.id);
        if (url) return { url, source: `aldostools:${game.platform}:${item.id}`, matchedTitle: item.title };
      }
    } catch (error) { console.warn('Sony cover index unavailable', error); }
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
      const age = cached?.updatedAt ? Date.now() - new Date(cached.updatedAt).getTime() : Infinity;
      let paths = Array.isArray(cached?.paths) ? cached.paths : [];
      if (!paths.length || age > TREE_TTL) {
        const response = await fetch(`https://api.github.com/repos/libretro-thumbnails/${repo}/git/trees/master?recursive=1`, {
          headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store',
        });
        if (!response.ok) {
          if (!paths.length) throw new Error(`Libretro ${repo}: HTTP ${response.status}`);
        } else {
          const data = await response.json();
          const fresh = (data.tree || [])
            .filter(item => item.type === 'blob' && /^Named_Boxarts\/.+\.(png|jpe?g|webp)$/i.test(item.path || ''))
            .map(item => item.path);
          if (fresh.length) {
            paths = fresh;
            await putValues([[key, { updatedAt: new Date().toISOString(), paths }]]);
          }
        }
      }
      return paths;
    })();
    libretroIndexPromises.set(repo, job);
    try { return await job; }
    catch (error) { libretroIndexPromises.delete(repo); throw error; }
  }

  function libretroUrl(repo, path) {
    return `https://raw.githubusercontent.com/libretro-thumbnails/${repo}/master/${String(path).split('/').map(encodeURIComponent).join('/')}`;
  }

  async function resolveLibretro(game) {
    const repos = LIBRETRO_REPOS[game.platform] || [];
    if (!repos.length) return null;
    const wanted = simplify(game.title);
    const candidates = [];
    for (const repo of repos) {
      try {
        const paths = await libretroIndex(repo);
        for (const path of paths) {
          const filename = path.split('/').pop() || '';
          const candidate = simplify(stripCoverTags(filename));
          const score = titleScore(candidate, wanted) + regionPenalty(path);
          if (score <= 28) candidates.push({ repo, path, filename, score });
        }
      } catch (error) { console.warn('Libretro cover index', repo, error); }
    }
    candidates.sort((a, b) => a.score - b.score || a.filename.length - b.filename.length);
    const candidate = candidates[0];
    return candidate ? {
      url: libretroUrl(candidate.repo, candidate.path),
      source: `libretro:${candidate.repo}`,
      matchedTitle: stripCoverTags(candidate.filename),
    } : null;
  }

  async function loadSwitchDb() {
    if (switchDbPromise) return switchDbPromise;
    switchDbPromise = (async () => {
      const cached = await getValue(SWITCH_DB_KEY, null);
      const age = cached?.updatedAt ? Date.now() - new Date(cached.updatedAt).getTime() : Infinity;
      let text = cached?.text || '';
      if (!text || age > SWITCH_DB_TTL) {
        const urls = [SWITCH_DB_URL, `https://api.allorigins.win/raw?url=${encodeURIComponent(SWITCH_DB_URL)}`];
        let lastError = null;
        for (const url of urls) {
          try {
            const response = await fetch(url, { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const next = await response.text();
            if (!next.includes(' = ')) throw new Error('Unexpected GameTDB response');
            text = next;
            await putValues([[SWITCH_DB_KEY, { updatedAt: new Date().toISOString(), text }]]);
            break;
          } catch (error) { lastError = error; }
        }
        if (!text) throw lastError || new Error('GameTDB недоступен');
      }
      const entries = [];
      const exact = new Map();
      for (const line of text.split(/\r?\n/)) {
        const pos = line.indexOf(' = ');
        if (pos <= 0) continue;
        const id = line.slice(0, pos).trim();
        const title = line.slice(pos + 3).trim();
        const key = normalize(title);
        if (!id || !key) continue;
        const item = { id, title, key, simple: simplify(title) };
        entries.push(item);
        if (!exact.has(key)) exact.set(key, item);
      }
      return { entries, exact };
    })();
    try { return await switchDbPromise; }
    catch (error) { switchDbPromise = null; throw error; }
  }

  async function findSwitchGame(title) {
    const db = await loadSwitchDb();
    const wanted = normalize(title);
    const simpleWanted = simplify(title);
    const exact = db.exact.get(wanted);
    if (exact) return exact;
    const first = simpleWanted.split(' ')[0];
    const pool = first ? db.entries.filter(item => item.simple.includes(first)) : db.entries;
    let best = null;
    for (const item of pool) {
      const score = Math.min(titleScore(item.key, wanted), titleScore(item.simple, simpleWanted));
      if (!best || score < best.score) best = { ...item, score };
    }
    return best && best.score <= 28 ? best : null;
  }

  function switchCoverUrls(id) {
    const out = [];
    const proxy = source => `https://images.weserv.nl/?url=${encodeURIComponent(source)}&output=webp&q=90`;
    for (const type of ['coverHQ', 'coverM', 'cover']) {
      for (const region of ['US', 'EN', 'AU', 'CA', 'JA']) {
        for (const ext of ['jpg', 'png']) {
          const source = `https://art.gametdb.com/switch/${type}/${region}/${id}.${ext}`;
          out.push(proxy(source), source);
        }
      }
    }
    return [...new Set(out)];
  }

  async function firstWorkingUrl(urls, batchSize = 4) {
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const results = await Promise.all(batch.map(url => imageWorks(url, 2600)));
      const found = results.findIndex(Boolean);
      if (found >= 0) return batch[found];
    }
    return '';
  }

  async function resolveSwitch(game) {
    try {
      const match = await findSwitchGame(game.title);
      if (!match) return null;
      const url = await firstWorkingUrl(switchCoverUrls(match.id));
      return url ? { url, source: `gametdb-switch:${match.id}`, matchedTitle: match.title } : null;
    } catch (error) {
      console.warn('Switch cover resolver unavailable', error);
      return null;
    }
  }

  async function resolveWikipedia(game) {
    if (typeof fetchWikipediaCover !== 'function') return null;
    try {
      const result = await fetchWikipediaCover(game.title, game.releaseYear || '', game.platform || '');
      return result?.url ? {
        url: result.url,
        source: result.source || `wikipedia:${game.platform || 'game'}`,
        matchedTitle: result.matchedTitle || game.title,
      } : null;
    } catch (error) {
      console.warn('Wikipedia cover fallback failed', game.title, error);
      return null;
    }
  }

  async function resolveCover(game) {
    if (game.platform === 'VITA') {
      const vita = await resolveVita(game);
      if (vita) return vita;
    }
    if (game.platform === 'PS3' || game.platform === 'PSP') {
      const sony = await resolveAldoSony(game);
      if (sony) return sony;
    }
    if (game.platform === 'SWITCH') {
      const sw = await resolveSwitch(game);
      if (sw) return sw;
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
      const games = main.games.filter(game => game && !game.deletedAt);
      if (!games.length) {
        finish('Обложки проверены', 'В библиотеке пока нет игр');
        return;
      }

      const missing = [];
      let checked = 0;
      progress('Проверяю сохранённые обложки', 0, games.length, `0 из ${games.length}`);
      await mapLimit(games, 5, async game => {
        const url = String(game.coverUrl || '').trim();
        const valid = url ? await imageWorks(url, 2800) : false;
        if (!valid) missing.push(game);
        checked++;
        progress('Проверяю сохранённые обложки', checked, games.length, `${checked} из ${games.length} · отсутствует/сломано: ${missing.length}`);
      });

      if (!missing.length) {
        finish('Все обложки на месте', `${games.length} из ${games.length} работают`);
        return;
      }

      let done = 0;
      let found = 0;
      const foundByPlatform = {};
      progress('Ищу отсутствующие обложки', 0, missing.length, `0 из ${missing.length} · найдено: 0`);

      await mapLimit(missing, 2, async game => {
        let resolved = null;
        try { resolved = await resolveCover(game); }
        catch (error) { console.warn('Cover resolver failed', game.title, error); }
        if (resolved?.url) {
          game.coverUrl = resolved.url;
          game.coverSource = resolved.source || 'cover-refresh-v15';
          game.updatedAt = new Date().toISOString();
          found++;
          foundByPlatform[game.platform] = (foundByPlatform[game.platform] || 0) + 1;
        } else {
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

      const byId = new Map(games.map(game => [game.id, game]));
      main.games = main.games.map(original => byId.get(original.id) || original);
      await putValues([
        [MAIN_KEY, main],
        [CATALOG_KEY, { ...catalogState, catalog }],
      ]);

      const unresolved = missing.filter(game => !game.coverUrl);
      const summary = Object.entries(foundByPlatform).map(([platform, count]) => `${platform}: +${count}`).join(' · ');
      const examples = unresolved.slice(0, 3).map(game => game.title).join(', ');
      const detail = `Восстановлено: ${found} · осталось без обложки: ${unresolved.length}` +
        (summary ? ` · ${summary}` : '') +
        (examples ? ` · не найдено: ${examples}${unresolved.length > 3 ? '…' : ''}` : '');
      finish(found ? 'Обложки обновлены' : 'Новых обложек не найдено', detail);

      if (found) setTimeout(() => location.reload(), 1700);
    } catch (error) {
      console.error(error);
      fail(error?.message || String(error));
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
