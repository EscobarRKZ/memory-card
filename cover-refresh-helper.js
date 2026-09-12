/* Memory Card — real cover refresh v1
   Intercepts the Settings > Refresh covers button and performs an actual validation/repair pass.
   It validates saved URLs, resolves only missing/broken covers, persists results to IndexedDB,
   then reloads so app.js and sync see the same state.
*/
(() => {
  const DB_NAME = 'memory-card-db';
  const STORE = 'state';
  const MAIN_KEY = 'main';
  const CATALOG_KEY = 'catalog-v1';

  const REPOS = {
    PSP: ['Sony_-_PlayStation_Portable'],
    VITA: ['Sony_-_PlayStation_Vita'],
    DSI: ['Nintendo_-_Nintendo_DS', 'Nintendo_-_Nintendo_DSi'],
    '3DS': ['Nintendo_-_Nintendo_3DS'],
    GBA: ['Nintendo_-_Game_Boy_Advance'],
    PS3: ['Sony_-_PlayStation_3', 'Sony_-_PlayStation_3_Downloadable'],
    WIIU: ['Nintendo_-_Wii_U'],
  };

  const WIKI_ALIASES = [
    [/^metal gear solid 2 sons of liberty(?: hd)?$/, 'Metal Gear Solid HD Collection'],
    [/^metal gear solid 3 snake eater(?: hd)?$/, 'Metal Gear Solid HD Collection'],
    [/^metal gear solid hd collection$/, 'Metal Gear Solid HD Collection'],
    [/^sonic unleashed$/, 'Sonic Unleashed'],
    [/^red dead redemption$/, 'Red Dead Redemption'],
    [/^resistance burning skies$/, 'Resistance: Burning Skies'],
  ];

  let running = false;
  const indexPromises = new Map();

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
    .replace(/\b(game of the year|goty|ultimate|remastered|remaster|edition|version)\b/g, ' ')
    .replace(/\bhd\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getStoreValue(key, fallback = null) {
    const db = await openDb();
    return new Promise(resolve => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? fallback);
      req.onerror = () => resolve(fallback);
    });
  }

  async function putStoreValues(entries) {
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
    el.innerHTML = '<div class="task-progress-head"><span data-task-label>Проверяю обложки…</span><b data-task-percent>0%</b></div><div class="task-progress-track"><i data-task-bar></i></div><div class="task-progress-detail" data-task-detail></div>';
    document.body.appendChild(el);
    return el;
  }

  function progress(label, current, total, detail = '') {
    const el = ensureProgress();
    const safeTotal = Math.max(1, Number(total) || 1);
    const safeCurrent = Math.max(0, Math.min(safeTotal, Number(current) || 0));
    const pct = Math.round((safeCurrent / safeTotal) * 100);
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

  function imageWorks(url, timeoutMs = 2200) {
    return new Promise(resolve => {
      if (!/^https?:\/\//i.test(String(url || ''))) { resolve(false); return; }
      const img = new Image();
      let done = false;
      const finish = ok => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        img.onload = null;
        img.onerror = null;
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      img.onload = () => finish(img.naturalWidth > 40 && img.naturalHeight > 40);
      img.onerror = () => finish(false);
      img.referrerPolicy = 'no-referrer';
      img.src = String(url);
    });
  }

  function stripCoverTags(value = '') {
    return String(value)
      .replace(/\.[a-z0-9]{2,5}$/i, '')
      .replace(/\s*[\[(](?:USA|Europe|Japan|World|Australia|Korea|Asia|En(?:,[A-Za-z]+)*|Rev[^\])]*|Disc[^\])]*|Disk[^\])]*|v\d[^\])]*)[\])]/gi, ' ')
      .replace(/\s*[\[(][^\])]*(?:Proto|Beta|Demo|Sample|Unl|Virtual Console|PSN)[^\])]*[\])]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function matchScore(filename, title) {
    const a = simplify(stripCoverTags(filename));
    const b = simplify(title);
    if (!a || !b) return 999;
    if (a === b) return 0;
    if (a.startsWith(b) || b.startsWith(a)) return 7 + Math.abs(a.length - b.length) / 8;
    if (a.includes(b) || b.includes(a)) return 13 + Math.abs(a.length - b.length) / 6;
    const aa = new Set(a.split(' ').filter(Boolean));
    const bb = new Set(b.split(' ').filter(Boolean));
    const common = [...bb].filter(x => aa.has(x)).length;
    const union = new Set([...aa, ...bb]).size || 1;
    return 100 - (common / union) * 80 + Math.abs(aa.size - bb.size) * 2;
  }

  function regionPenalty(path = '') {
    if (/\(USA\)|\(World\)/i.test(path)) return 0;
    if (/\(Europe\)/i.test(path)) return 1;
    if (/\(Australia\)/i.test(path)) return 2;
    if (/\(Japan\)/i.test(path)) return 6;
    return 3;
  }

  async function getLibretroIndex(repo) {
    if (indexPromises.has(repo)) return indexPromises.get(repo);
    const job = (async () => {
      const key = `libretro-index:${repo}`;
      const cached = await getStoreValue(key, null);
      if (Array.isArray(cached?.paths) && cached.paths.length) return cached.paths;
      const url = `https://api.github.com/repos/libretro-thumbnails/${repo}/git/trees/master?recursive=1`;
      const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
      if (!response.ok) throw new Error(`Libretro ${repo}: HTTP ${response.status}`);
      const data = await response.json();
      const paths = (data.tree || [])
        .filter(x => x.type === 'blob' && /^Named_Boxarts\/.+\.(png|jpe?g|webp)$/i.test(x.path || ''))
        .map(x => x.path);
      if (paths.length) await putStoreValues([[key, { updatedAt: new Date().toISOString(), paths }]]);
      return paths;
    })();
    indexPromises.set(repo, job);
    try { return await job; }
    catch (error) { indexPromises.delete(repo); throw error; }
  }

  function rawGithubUrl(repo, path) {
    const encoded = String(path).split('/').map(encodeURIComponent).join('/');
    return `https://raw.githubusercontent.com/libretro-thumbnails/${repo}/master/${encoded}`;
  }

  async function resolveLibretro(game) {
    const repos = REPOS[game.platform] || [];
    const candidates = [];
    for (const repo of repos) {
      try {
        const paths = await getLibretroIndex(repo);
        for (const path of paths) {
          const filename = path.split('/').pop() || '';
          const score = matchScore(filename, game.title) + regionPenalty(path);
          if (score <= 32) candidates.push({ repo, path, score, filename });
        }
      } catch (error) {
        console.warn('Cover refresh Libretro:', repo, error);
      }
    }
    candidates.sort((a, b) => a.score - b.score || a.filename.length - b.filename.length);
    for (const candidate of candidates.slice(0, 6)) {
      const url = rawGithubUrl(candidate.repo, candidate.path);
      if (await imageWorks(url, 2600)) return { url, source: `libretro:${candidate.repo}` };
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
      const bad = /\b(logo|icon|screenshot|gameplay|map|symbol|wordmark|developer|director|producer|composer|portrait|photo)\b/i;
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
        if (option.score <= 12 && await imageWorks(option.url, 3000)) return option.url;
      }
    } catch (error) {
      console.warn('Cover refresh Wikipedia parse:', error);
    }
    return '';
  }

  async function resolveWikipedia(game) {
    const alias = wikiAlias(game.title);
    if (alias) {
      const url = await infoboxImage(alias);
      if (url) return { url, source: 'wikipedia-infobox-refresh' };
    }
    const queries = [
      `intitle:"${game.title}" video game`,
      `"${game.title}" video game`,
    ];
    for (const query of queries) {
      try {
        const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=0&gsrlimit=6&gsrsearch=${encodeURIComponent(query)}`;
        const response = await fetch(url);
        if (!response.ok) continue;
        const data = await response.json();
        const pages = Object.values(data.query?.pages || {}).sort((a, b) => wikiTitleScore(a.title, game.title) - wikiTitleScore(b.title, game.title));
        for (const page of pages.slice(0, 3)) {
          if (wikiTitleScore(page.title, game.title) > 8) continue;
          const image = await infoboxImage(page.title);
          if (image) return { url: image, source: 'wikipedia-infobox-refresh' };
        }
      } catch (error) {
        console.warn('Cover refresh Wikipedia search:', error);
      }
    }
    return null;
  }

  async function resolveCover(game) {
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
    const oldDisabled = button?.disabled;
    if (button) button.disabled = true;
    try {
      const main = await getStoreValue(MAIN_KEY, null);
      const games = Array.isArray(main?.games) ? main.games.filter(g => g && !g.deletedAt) : [];
      if (!games.length) {
        finish('Обложки', 'В библиотеке пока нет игр');
        return;
      }

      const missing = [];
      let checked = 0;
      progress('Проверяю сохранённые обложки', 0, games.length, `0 из ${games.length}`);
      await mapLimit(games, 5, async game => {
        const isManual = String(game.coverSource || '') === 'manual';
        const ok = isManual ? Boolean(game.coverUrl) : (game.coverUrl ? await imageWorks(game.coverUrl, 1800) : false);
        if (!ok) missing.push(game);
        checked++;
        progress('Проверяю сохранённые обложки', checked, games.length, `${checked} из ${games.length} · найдено проблемных: ${missing.length}`);
      });

      if (!missing.length) {
        finish('Обложки в порядке', `${games.length} проверено · отсутствующих нет`);
        return;
      }

      const changes = new Map();
      let repaired = 0;
      let resolvedCount = 0;
      progress('Ищу отсутствующие обложки', 0, missing.length, `0 из ${missing.length}`);
      for (const game of missing) {
        let resolved = null;
        try { resolved = await resolveCover(game); }
        catch (error) { console.warn('Cover refresh resolver:', game.title, error); }
        if (resolved?.url) {
          changes.set(game.id, { url: resolved.url, source: resolved.source || 'cover-refresh' });
          repaired++;
        } else if (game.coverUrl && game.coverSource !== 'manual') {
          changes.set(game.id, { url: '', source: '' });
        }
        resolvedCount++;
        progress('Ищу отсутствующие обложки', resolvedCount, missing.length, `${resolvedCount} из ${missing.length} · найдено: ${repaired} · ${game.title}`);
      }

      if (changes.size) {
        // Re-read immediately before writing so a concurrent background sync cannot be overwritten wholesale.
        const latestMain = await getStoreValue(MAIN_KEY, main);
        const latestCatalog = await getStoreValue(CATALOG_KEY, { catalog: [], catalogMeta: {} });
        const now = new Date().toISOString();
        for (const game of latestMain.games || []) {
          const change = changes.get(game.id);
          if (!change) continue;
          game.coverUrl = change.url;
          game.coverSource = change.source;
          game.updatedAt = now;
          const titleKey = normalize(game.title);
          for (const entry of latestCatalog.catalog || []) {
            if (entry.platform === game.platform && normalize(entry.title) === titleKey) {
              entry.coverUrl = change.url;
              entry.coverSource = change.source;
            }
          }
        }
        await putStoreValues([[MAIN_KEY, latestMain], [CATALOG_KEY, latestCatalog]]);
      }

      const remaining = missing.length - repaired;
      finish('Обложки проверены', `${games.length} игр · исправлено ${repaired} · осталось без обложки ${remaining}`);
      setTimeout(() => location.reload(), 900);
    } catch (error) {
      console.error('Cover refresh failed:', error);
      fail(error?.message || String(error));
    } finally {
      running = false;
      if (button) button.disabled = oldDisabled || false;
    }
  }

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('[data-action="covers-refresh"]') : null;
    if (!target) return;
    // app.js owns an older refresh handler. Stop it and use the validated repair pass above instead.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    runRefresh(target);
  }, true);
})();
