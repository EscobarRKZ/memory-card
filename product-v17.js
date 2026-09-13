(() => {
  const ORIGINAL_ACCENTS = ['memory','ps2','gameboy','dreamcast','xbox','famicom','vita','oled','sunset','arcade','glacier','mono'];
  const EXTRA_ACCENTS = ['ps1','psp','ps3','switch','gamecube','wii','n64','snes','genesis','x360','dsi','3ds'];
  const ALL_ACCENTS = [...ORIGINAL_ACCENTS, ...EXTRA_ACCENTS];
  const THEME_NAMES = {
    memory:'Memory Purple', ps2:'PS2 Blue', gameboy:'Game Boy Green', dreamcast:'Dreamcast Orange', xbox:'Xbox Green',
    famicom:'Famicom Red', vita:'Vita Aqua', oled:'OLED Black', sunset:'Sunset', arcade:'Arcade Neon', glacier:'Glacier', mono:'Monochrome',
    ps1:'PS1 Smoke', psp:'PSP XMB', ps3:'PS3 Wave', switch:'Switch Neon', gamecube:'GameCube Indigo', wii:'Wii Ice',
    n64:'Nintendo 64', snes:'SNES Lavender', genesis:'Mega Drive', x360:'Xbox 360 Blades', dsi:'DSi White', '3ds':'3DS Red'
  };
  let themesExpanded = false;

  const norm = value => String(value || '').toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'').replace(/[™®©]/g,'').replace(/&/g,' and ')
    .replace(/[^a-z0-9а-яё]+/gi,' ').replace(/\s+/g,' ').trim();

  function currentRotationPlatforms() {
    const ids = [];
    if (mcRotationEnabled('handheld')) {
      const id = currentPlatformFor('handheld');
      if (id) ids.push(id);
    }
    if (mcRotationEnabled('desktop')) {
      const id = currentPlatformFor('desktop');
      if (id) ids.push(id);
    }
    return [...new Set(ids)];
  }

  function pickHomePlaying() {
    const all = liveGames().filter(g => g.status === 'playing');
    if (!all.length) return null;
    const rotationPlatforms = currentRotationPlatforms();
    const anyRotation = mcRotationEnabled('handheld') || mcRotationEnabled('desktop');
    const pool = anyRotation ? all.filter(g => rotationPlatforms.includes(g.platform)) : all;
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)] || pool[0];
  }

  function homeHeroV17(current) {
    const playing = liveGames().filter(g => g.status === 'playing');
    const rotationPlatforms = currentRotationPlatforms();
    if (!current) {
      const rotationText = rotationPlatforms.length ? rotationPlatforms.map(x => platform(x).abbr).join(' · ') : 'Свободная игра';
      return `<section class="v16-home-hero empty-hero v17-home-empty"><div><span class="v16-eyebrow">Memory Card</span><h2>${playing.length ? 'На текущей ротации нет активной игры' : 'Выбери следующую игру'}</h2><p>${playing.length ? `Текущие устройства: ${esc(rotationText)}. На главной показываются только активные игры текущей ротации.` : 'Начни игру из Backlog или добавь текущее прохождение.'}</p><button class="primary" data-nav="${playing.length ? 'playing' : 'backlog'}">${playing.length ? 'Сейчас играю' : 'Открыть Backlog'}</button></div></section>`;
    }
    return `<section class="v16-home-hero platform-bg-${String(current.platform).toLowerCase()}" ${current.coverUrl ? `style="--hero-image:url('${esc(current.coverUrl)}')"` : ''}><div class="v16-hero-cover">${coverMarkup(current,'v16-hero-art')}</div><div class="v16-hero-copy"><span class="v16-eyebrow">Сейчас играешь</span><h2>${esc(current.title)}</h2><div class="v16-badge-row"><span>${esc(platform(current.platform).abbr)}</span>${current.releaseYear ? `<span>${esc(current.releaseYear)}</span>` : ''}${current.genre ? `<span>${esc(current.genre)}</span>` : ''}</div>${current.notes ? `<p>${esc(current.notes)}</p>` : ''}<button class="primary" data-v16-game-detail="${esc(current.id)}">Открыть игру</button></div><div class="v16-hero-side"><div><small>Текущая ротация</small><b>${rotationPlatforms.length ? rotationPlatforms.map(x => esc(platform(x).abbr)).join(' · ') : 'Свободная игра'}</b></div></div></section>`;
  }

  const baseHomeV17 = renderHome;
  renderHome = function() {
    const html = baseHomeV17();
    const hero = homeHeroV17(pickHomePlaying());
    return html.replace(/^<section class="v16-home-hero[\s\S]*?<\/section>/, hero);
  };

  function backlogGamesV17() {
    return state.games.filter(g => g && !g.deletedAt && g.status === 'backlog').map(migrateGame);
  }

  function renderBacklogV17() {
    const games = backlogGamesV17();
    return `<div class="section-head"><div><h2>Backlog</h2><p>Игры на потом. Они не входят в библиотеку и статистику, пока ты не начнёшь прохождение.</p></div></div>
      <section class="panel v16-backlog-add"><h3>Добавить в Backlog</h3>
        <form id="v17BacklogForm" class="v16-backlog-form v17-backlog-form" autocomplete="off">
          <div class="v17-catalog-field"><input name="title" required maxlength="160" placeholder="Название игры" data-v17-backlog-title><div class="v17-catalog-suggestions" data-v17-backlog-suggestions hidden></div></div>
          <select name="platform" data-v17-backlog-platform>${mcOwnedPlatforms().map(id => `<option value="${id}">${esc(platform(id).name)}</option>`).join('')}</select>
          <input name="releaseYear" maxlength="4" inputmode="numeric" placeholder="Год">
          <input name="genre" maxlength="80" placeholder="Жанр">
          <input name="franchise" maxlength="100" placeholder="Франшиза">
          <textarea name="notes" rows="2" maxlength="1000" placeholder="Почему хочу пройти / заметка"></textarea>
          <button class="primary" type="submit">+ В Backlog</button>
        </form>
      </section>
      <section class="panel"><div class="section-head"><div><h3>Очередь</h3><p>${games.length} ${games.length === 1 ? 'игра' : 'игр'}</p></div></div>
        ${games.length ? `<div class="v16-backlog-grid">${games.map(g => `<article class="v16-backlog-card">${coverMarkup(g,'v16-backlog-cover')}<div><span class="v16-platform-pill">${esc(platform(g.platform).abbr)}</span><h3>${esc(g.title)}</h3><p>${esc(g.notes || g.genre || 'Без заметки')}</p><div class="v16-card-actions"><button class="primary compact" data-v16-backlog-start="${esc(g.id)}">Начинаю проходить</button><button class="ghost compact" data-v16-backlog-remove="${esc(g.id)}">Удалить</button></div></div></article>`).join('')}</div>` : '<div class="empty">Backlog пуст. Добавь сюда игры, которые хочешь когда-нибудь начать.</div>'}
      </section>`;
  }

  const baseViewV17 = renderView;
  renderView = function() {
    if (state.view === 'backlog') return renderBacklogV17();
    return baseViewV17().replace('Внутренние достижения Memory Card. Никакого playtime — только твой игровой архив.','Внутренние достижения Memory Card.');
  };

  function showBacklogSuggestions(form) {
    const input = form?.querySelector('[data-v17-backlog-title]');
    const pid = form?.querySelector('[data-v17-backlog-platform]')?.value || '';
    const box = form?.querySelector('[data-v17-backlog-suggestions]');
    if (!input || !box || !pid) return;
    const q = input.value.trim();
    const items = q ? catalogSearch(pid, q).slice(0, 8) : [];
    if (!items.length) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    box.innerHTML = items.map((item,i) => `<button type="button" data-v17-backlog-suggestion="${i}" data-title="${esc(item.title)}" data-year="${esc(item.releaseYear || '')}" data-genre="${esc(item.genre || '')}" data-franchise="${esc(item.franchise || '')}" data-cover="${esc(item.coverUrl || '')}"><b>${esc(item.title)}</b><span>${esc(item.releaseYear || 'Год не указан')} · ${esc(platform(pid).abbr)}</span></button>`).join('');
    box.hidden = false;
  }

  function exactCatalogMatch(pid, title) {
    const wanted = norm(title);
    return catalogSearch(pid, title).find(x => norm(x.title) === wanted) || null;
  }

  async function saveBacklogV17(form) {
    const fd = new FormData(form);
    let title = String(fd.get('title') || '').trim();
    const pid = String(fd.get('platform') || '');
    if (!title || !pid) return;
    const match = exactCatalogMatch(pid, title);
    if (match?.title) title = match.title;
    const now = nowIso();
    const g = migrateGame({
      id: crypto.randomUUID ? crypto.randomUUID() : `b-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title,
      platform: pid,
      status: 'backlog',
      releaseYear: String(fd.get('releaseYear') || match?.releaseYear || ''),
      genre: String(fd.get('genre') || match?.genre || ''),
      franchise: String(fd.get('franchise') || match?.franchise || ''),
      notes: String(fd.get('notes') || ''),
      rating: '',
      replay: 0,
      coverUrl: String(match?.coverUrl || ''),
      coverSource: String(match?.coverSource || ''),
      addedAt: now,
      updatedAt: now
    });
    state.games.push(g);
    await persist();
    scheduleAutoSync();
    render();
    setToast('Добавлено в Backlog');
    if (!g.coverUrl) {
      try {
        const c = await fetchCoverForGame(g.title, g.releaseYear, g.platform);
        if (c?.url) {
          g.coverUrl = c.url;
          g.coverSource = c.source || '';
          g.updatedAt = nowIso();
          await persist();
          scheduleAutoSync();
          render();
        }
      } catch (_) {}
    }
  }

  async function collectionAddStable(gameId, collectionId) {
    if (!gameId || !collectionId) return;
    const list = Array.isArray(state.settings.collections) ? state.settings.collections : [];
    let changed = false;
    state.settings.collections = list.map(c => {
      if (c.id !== collectionId) return { ...c, gameIds:[...(c.gameIds || [])] };
      const ids = [...new Set([...(c.gameIds || []).map(String), String(gameId)])];
      changed = ids.length !== (c.gameIds || []).length;
      return { ...c, gameIds:ids };
    });
    if (!changed && !list.some(c => c.id === collectionId)) return;
    state.settings.settingsUpdatedAt = nowIso();
    await persist();
    scheduleAutoSync();
    render();
    setToast('Добавлено в коллекцию');
  }

  async function collectionRemoveStable(gameId, collectionId) {
    const list = Array.isArray(state.settings.collections) ? state.settings.collections : [];
    state.settings.collections = list.map(c => c.id === collectionId
      ? { ...c, gameIds:(c.gameIds || []).filter(id => String(id) !== String(gameId)) }
      : { ...c, gameIds:[...(c.gameIds || [])] });
    state.settings.settingsUpdatedAt = nowIso();
    await persist();
    scheduleAutoSync();
    render();
  }

  function enhanceGameDetail() {
    const hero = document.querySelector('.v16-detail-hero');
    const cover = hero?.querySelector('.v16-detail-cover, .cover');
    if (!hero || !cover || cover.closest('.v17-detail-cover-column')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'v17-detail-cover-column';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ghost compact v17-cover-refresh';
    btn.dataset.v17CoverRefresh = state.gameDetailId || '';
    btn.textContent = '↻ Обновить обложку';
    cover.before(wrapper);
    wrapper.append(btn, cover);
  }

  function enhanceRotationButtons() {
    document.querySelectorAll('.v16-rotation-mode').forEach(block => {
      const select = block.querySelector('[data-v16-rotation-mode]');
      if (!select || block.querySelector('.v17-rotation-buttons')) return;
      select.classList.add('v17-rotation-select-compat');
      const group = select.dataset.v16RotationMode;
      const current = state.settings[group === 'desktop' ? 'rotationDesktopMode' : 'rotationHandheldMode'] || 'classic';
      const box = document.createElement('div');
      box.className = 'v17-rotation-buttons';
      box.innerHTML = [
        ['classic','Классическая','По заданному порядку'],
        ['balance','Баланс','Дольше не использовалась'],
        ['random','Случайная','Новая случайная система']
      ].map(([id,name,hint]) => `<button type="button" class="${current === id ? 'active' : ''}" data-v17-rotation-mode="${id}" data-group="${group}"><b>${name}</b><small>${hint}</small></button>`).join('');
      select.before(box);
    });
  }

  function enhanceThemes() {
    const panel = document.querySelector('.v16-accent-panel');
    const grid = panel?.querySelector('.v16-theme-swatches');
    const select = panel?.querySelector('#accentTheme');
    if (!panel || !grid || !select) return;
    EXTRA_ACCENTS.forEach(id => {
      if (!select.querySelector(`option[value="${id}"]`)) {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = THEME_NAMES[id];
        select.appendChild(option);
      }
    });
    const current = ALL_ACCENTS.includes(state.settings.accentTheme) ? state.settings.accentTheme : 'memory';
    select.value = current;
    EXTRA_ACCENTS.forEach(id => {
      if (!grid.querySelector(`[data-v16-accent="${id}"]`)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'v16-swatch';
        button.dataset.v16Accent = id;
        button.title = THEME_NAMES[id];
        button.innerHTML = '<i></i>';
        grid.appendChild(button);
      }
    });
    const buttons = [...grid.querySelectorAll('[data-v16-accent]')];
    buttons.forEach((button,index) => {
      const id = button.dataset.v16Accent;
      button.classList.toggle('active', id === current);
      if (!button.querySelector('span')) {
        const label = document.createElement('span');
        label.textContent = THEME_NAMES[id] || id;
        button.appendChild(label);
      }
      button.classList.toggle('v17-theme-collapsed', !themesExpanded && index >= 8);
    });
    let toggle = panel.querySelector('[data-v17-themes-toggle]');
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'secondary compact v17-themes-toggle';
      toggle.dataset.v17ThemesToggle = '1';
      panel.appendChild(toggle);
    }
    toggle.textContent = themesExpanded ? 'Скрыть дополнительные стили' : `Показать все стили (${buttons.length})`;
  }

  function enhanceContrastAndAchievements() {
    document.querySelectorAll('.v16-ach-progress').forEach(progress => {
      const p = progress.closest('.section-head')?.querySelector('p');
      if (p && p.textContent.includes('Никакого playtime')) p.textContent = 'Внутренние достижения Memory Card.';
    });
  }

  function enhanceV17() {
    enhanceGameDetail();
    enhanceRotationButtons();
    enhanceThemes();
    enhanceContrastAndAchievements();
  }

  const baseRenderV17 = render;
  render = function() {
    baseRenderV17();
    queueMicrotask(enhanceV17);
  };

  queueMicrotask(enhanceV17);
  window.addEventListener('pageshow', () => queueMicrotask(enhanceV17));

  document.addEventListener('input', event => {
    if (event.target?.matches('[data-v17-backlog-title]')) showBacklogSuggestions(event.target.closest('form'));
  });

  document.addEventListener('change', event => {
    if (event.target?.matches('[data-v17-backlog-platform]')) showBacklogSuggestions(event.target.closest('form'));
    if (event.target?.matches('[data-current-group]')) {
      const group = event.target.dataset.currentGroup;
      state.settings[currentSettingKey(group)] = event.target.value;
      state.settings.settingsUpdatedAt = nowIso();
      persist().then(() => {
        scheduleAutoSync();
        render();
      });
    }
  });

  document.addEventListener('submit', event => {
    if (event.target?.id === 'v17BacklogForm') {
      event.preventDefault();
      saveBacklogV17(event.target);
    }
  });

  document.addEventListener('click', event => {
    const el = event.target instanceof Element
      ? event.target.closest('[data-v17-backlog-suggestion],[data-v17-rotation-mode],[data-v17-themes-toggle]')
      : null;
    if (!el) return;

    if (el.dataset.v17BacklogSuggestion !== undefined) {
      const form = el.closest('form');
      if (!form) return;
      form.querySelector('[name="title"]').value = el.dataset.title || '';
      form.querySelector('[name="releaseYear"]').value = el.dataset.year || '';
      if (el.dataset.genre) form.querySelector('[name="genre"]').value = el.dataset.genre;
      if (el.dataset.franchise) form.querySelector('[name="franchise"]').value = el.dataset.franchise;
      const box = form.querySelector('[data-v17-backlog-suggestions]');
      if (box) {
        box.hidden = true;
        box.innerHTML = '';
      }
      return;
    }

    if (el.dataset.v17RotationMode) {
      const group = el.dataset.group;
      const mode = el.dataset.v17RotationMode;
      const key = group === 'desktop' ? 'rotationDesktopMode' : 'rotationHandheldMode';
      state.settings[key] = mode;
      state.settings.settingsUpdatedAt = nowIso();
      const block = el.closest('.v16-rotation-mode');
      const select = block?.querySelector('[data-v16-rotation-mode]');
      if (select) select.value = mode;
      block?.querySelectorAll('[data-v17-rotation-mode]').forEach(button => button.classList.toggle('active', button === el));
      persist().then(() => scheduleAutoSync());
      return;
    }

    if (el.dataset.v17ThemesToggle) {
      themesExpanded = !themesExpanded;
      enhanceThemes();
    }
  }, true);

  document.addEventListener('click', event => {
    const add = event.target instanceof Element ? event.target.closest('[data-v16-collection-add]') : null;
    const remove = event.target instanceof Element ? event.target.closest('[data-v16-collection-remove-game]') : null;
    if (add) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const panel = add.closest('.panel');
      const select = panel?.querySelector('[data-v16-collection-select]');
      collectionAddStable(add.dataset.v16CollectionAdd, select?.value || '');
    }
    if (remove) {
      event.preventDefault();
      event.stopImmediatePropagation();
      collectionRemoveStable(remove.dataset.gameId, remove.dataset.v16CollectionRemoveGame);
    }
  }, true);
})();
