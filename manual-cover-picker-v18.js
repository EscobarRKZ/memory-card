/* Memory Card v0.17.3 — manual cover picker and strict exact-first resolver */
(() => {
  const repoMapCache = new Map();
  const originalFetchCoverForGame = fetchCoverForGame;

  const norm = value => String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[™®©]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9а-яё]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  function canonicalTitle(value = '') {
    return norm(String(value)
      .replace(/\.[a-z0-9]{2,5}$/i, '')
      .replace(/\s*[\[(](?:USA|Europe|Japan|World|Australia|Korea|Asia|Canada|En(?:,[A-Za-z]+)*|Rev[^\])]*|Disc[^\])]*|Disk[^\])]*)[\])]/gi, ' ')
      .replace(/\s*[\[(][^\])]*(?:Proto|Beta|Demo|Sample|Unl|Virtual Console|PSN)[^\])]*[\])]/gi, ' '))
      .replace(/\bviii\b/g, '8')
      .replace(/\bvii\b/g, '7')
      .replace(/\bvi\b/g, '6')
      .replace(/\bv\b/g, '5')
      .replace(/\biv\b/g, '4')
      .replace(/\biii\b/g, '3')
      .replace(/\bii\b/g, '2')
      .replace(/\bi\b/g, '1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function fileTitle(path = '') {
    let name = String(path).split('/').pop() || '';
    try { name = decodeURIComponent(name); } catch (_) {}
    return name.replace(/\.(png|jpe?g|webp)$/i, '');
  }

  function regionOf(name = '') {
    const m = String(name).match(/\((USA|World|Europe|Australia|Japan|Korea|Asia|Canada)\)/i);
    return m ? m[1] : '';
  }

  function regionRank(name = '') {
    if (/\((USA|World)\)/i.test(name)) return 0;
    if (/\(Europe\)/i.test(name)) return 1;
    if (/\(Australia\)|\(Canada\)/i.test(name)) return 2;
    if (/\(Asia\)|\(Korea\)/i.test(name)) return 3;
    if (/\(Japan\)/i.test(name)) return 5;
    return 4;
  }

  function comparableUrl(value = '') {
    try {
      const u = new URL(String(value));
      u.hash = '';
      ['cb','cache','t','ts','_'].forEach(k => u.searchParams.delete(k));
      let out = u.toString();
      try { out = decodeURIComponent(out); } catch (_) {}
      return out;
    } catch (_) {
      return String(value || '');
    }
  }

  function rawLibretro(repo, path) {
    return `https://raw.githubusercontent.com/libretro-thumbnails/${repo}/master/${String(path).split('/').map(encodeURIComponent).join('/')}`;
  }

  async function repoExactMap(repo) {
    if (repoMapCache.has(repo)) return repoMapCache.get(repo);
    const job = (async () => {
      const paths = await fetchLibretroBoxartIndex(repo);
      const map = new Map();
      for (const path of paths || []) {
        const title = fileTitle(path);
        const key = canonicalTitle(title);
        if (!key) continue;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push({ path, title });
      }
      return map;
    })();
    repoMapCache.set(repo, job);
    try { return await job; }
    catch (err) { repoMapCache.delete(repo); throw err; }
  }

  function reposFor(platformId) {
    const external = window.MemoryCardCoverSources?.libretroRepos?.[platformId];
    if (Array.isArray(external) && external.length) return external;
    try {
      return Array.isArray(LIBRETRO_COVER_REPOS?.[platformId]) ? LIBRETRO_COVER_REPOS[platformId] : [];
    } catch (_) {
      return [];
    }
  }

  async function libretroExactCandidates(game) {
    const wanted = canonicalTitle(game.title);
    if (!wanted) return [];
    const out = [];
    const repos = reposFor(game.platform);
    for (let ri = 0; ri < repos.length; ri += 1) {
      const repo = repos[ri];
      try {
        const map = await repoExactMap(repo);
        const rows = map.get(wanted) || [];
        for (const row of rows) {
          const region = regionOf(row.title);
          out.push({
            url: rawLibretro(repo, row.path),
            source: `libretro:${repo}`,
            label: `Libretro${region ? ` · ${region}` : ''}`,
            score: ri * 10 + regionRank(row.title),
            exact: true,
          });
        }
      } catch (err) {
        console.warn('Libretro exact lookup failed', repo, err);
      }
    }
    return out.sort((a, b) => a.score - b.score);
  }

  function catalogExactCandidates(game) {
    const wanted = canonicalTitle(game.title);
    return (state.catalog || [])
      .filter(x => x && x.platform === game.platform && x.coverUrl && canonicalTitle(x.title) === wanted)
      .map(x => ({
        url: String(x.coverUrl),
        source: x.coverSource || x.source || 'catalog-exact',
        label: `Каталог${x.releaseYear ? ` · ${x.releaseYear}` : ''}`,
        score: 30,
        exact: true,
      }));
  }

  function titleSimilarity(a, b) {
    const aa = new Set(canonicalTitle(a).split(' ').filter(Boolean));
    const bb = new Set(canonicalTitle(b).split(' ').filter(Boolean));
    if (!aa.size || !bb.size) return 0;
    let same = 0;
    aa.forEach(x => { if (bb.has(x)) same += 1; });
    return same / Math.max(aa.size, bb.size);
  }

  async function wikipediaCandidates(game) {
    const query = `${game.title}${game.releaseYear ? ` ${game.releaseYear}` : ''} video game`;
    const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=0&gsrlimit=8&gsrsearch=${encodeURIComponent(query)}&prop=pageimages&piprop=original|thumbnail&pithumbsize=720`;
    try {
      const response = await fetch(url);
      if (!response.ok) return [];
      const data = await response.json();
      return Object.values(data?.query?.pages || {})
        .map(page => {
          const image = page?.original?.source || page?.thumbnail?.source || '';
          const similarity = titleSimilarity(game.title, String(page?.title || '').replace(/\s*\([^)]*\)\s*$/g, ''));
          if (!image || similarity < 0.48) return null;
          return {
            url: image,
            source: `wikipedia:${page.title}`,
            label: `Wikipedia · ${page.title}`,
            score: 80 - similarity * 20,
            exact: canonicalTitle(page.title) === canonicalTitle(game.title),
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.score - b.score)
        .slice(0, 6);
    } catch (err) {
      console.warn('Wikipedia cover alternatives failed', err);
      return [];
    }
  }

  function uniqueCandidates(items, currentUrl = '') {
    const current = comparableUrl(currentUrl);
    const seen = new Set();
    const out = [];
    for (const item of items) {
      if (!item?.url || !/^https?:\/\//i.test(item.url)) continue;
      const key = comparableUrl(item.url);
      if (!key || key === current || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }

  async function collectCandidates(game) {
    const exactLibretro = await libretroExactCandidates(game);
    const catalog = catalogExactCandidates(game);
    let resolver = [];
    try {
      const result = await originalFetchCoverForGame(game.title, game.releaseYear, game.platform);
      if (result?.url) resolver = [{
        url: result.url,
        source: result.source || 'resolver',
        label: 'Автопоиск',
        score: 60,
        exact: false,
      }];
    } catch (_) {}

    let candidates = uniqueCandidates([...exactLibretro, ...catalog, ...resolver], game.coverUrl);
    if (candidates.length < 4) {
      const wiki = await wikipediaCandidates(game);
      candidates = uniqueCandidates([...candidates, ...wiki], game.coverUrl);
    }
    return candidates.sort((a, b) => (a.score || 99) - (b.score || 99)).slice(0, 12);
  }

  function closePicker() {
    document.querySelector('.mc-cover-picker-backdrop')?.remove();
  }

  function pickerShell(game) {
    const overlay = document.createElement('div');
    overlay.className = 'mc-cover-picker-backdrop';
    overlay.innerHTML = `
      <section class="mc-cover-picker" role="dialog" aria-modal="true" aria-label="Выбор обложки">
        <div class="mc-cover-picker-head">
          <div>
            <span class="mc-cover-picker-kicker">${esc(platform(game.platform).abbr)}</span>
            <h3>Выбрать другую обложку</h3>
            <p>${esc(game.title)}${game.releaseYear ? ` · ${esc(game.releaseYear)}` : ''}</p>
          </div>
          <button type="button" class="icon-btn" data-cover-picker-close aria-label="Закрыть">×</button>
        </div>
        <div class="mc-cover-current">
          <div class="mc-cover-current-art">${game.coverUrl ? `<img src="${esc(game.coverUrl)}" alt="Текущая обложка">` : '<span>Нет обложки</span>'}</div>
          <div><b>Текущая обложка</b><p>Она исключена из новых вариантов, поэтому кнопка больше не будет мгновенно возвращать тот же URL.</p></div>
        </div>
        <div class="mc-cover-picker-status">Ищу точные варианты…</div>
        <div class="mc-cover-picker-grid" data-cover-picker-grid></div>
        <div class="mc-cover-picker-manual">
          <div><b>Не нашлась правильная?</b><small>Можно вставить прямую ссылку на изображение.</small></div>
          <div class="mc-cover-picker-url"><input type="url" placeholder="https://…" data-cover-manual-url><button type="button" class="secondary" data-cover-manual-apply>Использовать URL</button></div>
        </div>
      </section>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  function renderCandidates(overlay, candidates) {
    const grid = overlay.querySelector('[data-cover-picker-grid]');
    const status = overlay.querySelector('.mc-cover-picker-status');
    if (!grid || !status) return;
    if (!candidates.length) {
      status.textContent = 'Автоматические источники не нашли другой подходящей обложки.';
      grid.innerHTML = '<div class="mc-cover-picker-empty">Попробуй прямую ссылку ниже. Текущая неправильная обложка не будет выбрана повторно автоматически.</div>';
      return;
    }
    status.textContent = `Найдено вариантов: ${candidates.length}. Выбери правильный визуально.`;
    grid.innerHTML = candidates.map((c, index) => `
      <button type="button" class="mc-cover-choice" data-cover-choice="${index}">
        <span class="mc-cover-choice-art"><img src="${esc(c.url)}" alt="" loading="lazy"></span>
        <span class="mc-cover-choice-meta"><b>${c.exact ? 'Точное совпадение' : 'Вариант'}</b><small>${esc(c.label || c.source || 'Источник')}</small></span>
      </button>`).join('');
  }

  async function applyCover(game, candidate) {
    if (!candidate?.url || !/^https?:\/\//i.test(candidate.url)) return;
    game.coverUrl = candidate.url;
    game.coverSource = candidate.source || 'manual-cover-picker';
    game.updatedAt = nowIso();

    const wanted = canonicalTitle(game.title);
    state.catalog = (state.catalog || []).map(entry => {
      if (entry?.platform !== game.platform || canonicalTitle(entry?.title) !== wanted) return entry;
      return { ...entry, coverUrl: candidate.url, coverSource: candidate.source || 'manual-cover-picker' };
    });

    try { if (coverLookups instanceof Map) coverLookups.clear(); } catch (_) {}
    await persist();
    scheduleAutoSync();
    closePicker();
    render();
    setToast('Обложка заменена');
  }

  async function openPicker(gameId, trigger) {
    const game = state.games.find(g => g?.id === gameId && !g.deletedAt);
    if (!game) return;
    const oldText = trigger?.textContent || '↻ Обновить обложку';
    if (trigger) { trigger.disabled = true; trigger.textContent = 'Ищу варианты…'; }
    const overlay = pickerShell(game);
    let candidates = [];
    try {
      candidates = await collectCandidates(game);
      overlay._mcCandidates = candidates;
      renderCandidates(overlay, candidates);
    } catch (err) {
      console.error(err);
      const status = overlay.querySelector('.mc-cover-picker-status');
      if (status) status.textContent = 'Не удалось получить автоматические варианты. Можно вставить URL вручную.';
    } finally {
      if (trigger?.isConnected) { trigger.disabled = false; trigger.textContent = oldText; }
    }
  }

  // Exact Libretro title match now wins before the older fuzzy resolver for future imports/additions.
  fetchCoverForGame = async function(title, releaseYear = '', platformId = '') {
    try {
      const exact = await libretroExactCandidates({ title, releaseYear, platform: platformId });
      if (exact.length) return { url: exact[0].url, source: exact[0].source || 'libretro-exact' };
    } catch (_) {}
    return originalFetchCoverForGame(title, releaseYear, platformId);
  };

  // Capture before product-v17's delegated bubble handler so the old single-result refresh never runs.
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    const refresh = target?.closest('[data-v17-cover-refresh]');
    if (refresh) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openPicker(refresh.dataset.v17CoverRefresh || state.gameDetailId || '', refresh);
      return;
    }

    const overlay = target?.closest('.mc-cover-picker-backdrop');
    if (!overlay) return;
    if (target.closest('[data-cover-picker-close]') || target === overlay) {
      event.preventDefault();
      closePicker();
      return;
    }

    const choice = target.closest('[data-cover-choice]');
    if (choice) {
      event.preventDefault();
      const game = state.games.find(g => g?.id === state.gameDetailId && !g.deletedAt);
      const candidate = overlay._mcCandidates?.[Number(choice.dataset.coverChoice)];
      if (game && candidate) applyCover(game, candidate).catch(console.error);
      return;
    }

    const manual = target.closest('[data-cover-manual-apply]');
    if (manual) {
      event.preventDefault();
      const input = overlay.querySelector('[data-cover-manual-url]');
      const url = String(input?.value || '').trim();
      if (!/^https?:\/\//i.test(url)) { setToast('Нужна прямая http/https ссылка на изображение'); return; }
      const game = state.games.find(g => g?.id === state.gameDetailId && !g.deletedAt);
      if (game) applyCover(game, { url, source: 'manual-url', label: 'Ручная ссылка' }).catch(console.error);
    }
  }, true);
})();
