/* Memory Card v0.17 — polish: backlog catalog, rotation-aware home, exact cover retry, themes */
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
  const coverIndexCache = new Map();

  const norm = value => String(value || '').toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'').replace(/[™®©]/g,'').replace(/&/g,' and ')
    .replace(/[^a-z0-9а-яё]+/gi,' ').replace(/\s+/g,' ').trim();
  const canonicalTitle = value => norm(String(value || '')
    .replace(/\.[a-z0-9]{2,5}$/i,'')
    .replace(/\s*[\[(](?:USA|Europe|Japan|World|Australia|Korea|Asia|En(?:,[A-Za-z]+)*|Rev[^\])]*|Disc[^\])]*|Disk[^\])]*)[\])]/gi,' ')
    .replace(/\s*[\[(][^\])]*(?:Proto|Beta|Demo|Sample|Unl|Virtual Console|PSN)[^\])]*[\])]/gi,' '))
    .replace(/\bviii\b/g,'8').replace(/\bvii\b/g,'7').replace(/\bvi\b/g,'6').replace(/\bv\b/g,'5')
    .replace(/\biv\b/g,'4').replace(/\biii\b/g,'3').replace(/\bii\b/g,'2').replace(/\bi\b/g,'1')
    .replace(/\s+/g,' ').trim();

  const baseMigrateV17 = migrateSettings;
  migrateSettings = function(raw={}) {
    const out = baseMigrateV17(raw);
    if (ALL_ACCENTS.includes(raw.accentTheme)) out.accentTheme = raw.accentTheme;
    return out;
  };
  state.settings = migrateSettings(state.settings || {});

  const baseMergeV17 = mergeClientSettings;
  mergeClientSettings = function(local, remote) {
    const out = baseMergeV17(local, remote);
    const remoteWins = String(remote?.settingsUpdatedAt || '') > String(local?.settingsUpdatedAt || '');
    const src = remoteWins ? (remote || {}) : (local || {});
    if (ALL_ACCENTS.includes(src.accentTheme)) out.accentTheme = src.accentTheme;
    return out;
  };

  const baseSyncV17 = syncableSettings;
  syncableSettings = function() {
    return { ...baseSyncV17(), accentTheme: ALL_ACCENTS.includes(state.settings.accentTheme) ? state.settings.accentTheme : 'memory' };
  };

  function applyAccentV17() {
    const chosen = ALL_ACCENTS.includes(state.settings.accentTheme) ? state.settings.accentTheme : 'memory';
    document.documentElement.dataset.mcAccent = chosen;
    document.documentElement.classList.toggle('mc-oled-accent', chosen === 'oled');
  }

  const baseSaveSettingsV17 = saveSettings;
  saveSettings = async function(silent=false) {
    const selectedAccent = document.querySelector('#accentTheme')?.value || state.settings.accentTheme;
    await baseSaveSettingsV17(true);
    if (ALL_ACCENTS.includes(selectedAccent)) state.settings.accentTheme = selectedAccent;
    state.settings.settingsUpdatedAt = nowIso();
    await persist();
    applyAccentV17();
    scheduleAutoSync();
    if (!silent) setToast('Настройки сохранены');
    render();
  };

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
    const playing = liveGames().filter(g=>g.status==='playing');
    const last = [...liveGames().filter(g=>g.status==='completed')]
      .sort((a,b)=>String(b.updatedAt||b.addedAt||'').localeCompare(String(a.updatedAt||a.addedAt||'')))[0];
    const rotationPlatforms = currentRotationPlatforms();
    if (!current) {
      const rotationText = rotationPlatforms.length ? rotationPlatforms.map(x=>platform(x).abbr).join(' · ') : 'Свободная игра';
      return `<section class="v16-home-hero empty-hero v17-home-empty"><div><span class="v16-eyebrow">Memory Card</span><h2>${playing.length?'На текущей ротации нет активной игры':'Выбери следующую игру'}</h2><p>${playing.length?`Текущие устройства: ${esc(rotationText)}. На главной показываются только активные игры текущей ротации.`:'Начни игру из Backlog или добавь текущее прохождение.'}</p><button class="primary" data-nav="${playing.length?'playing':'backlog'}">${playing.length?'Сейчас играю':'Открыть Backlog'}</button></div></section>`;
    }
    return `<section class="v16-home-hero platform-bg-${String(current.platform).toLowerCase()}" ${current.coverUrl?`style="--hero-image:url('${esc(current.coverUrl)}')"`:''}><div class="v16-hero-cover">${coverMarkup(current,'v16-hero-art')}</div><div class="v16-hero-copy"><span class="v16-eyebrow">Сейчас играешь</span><h2>${esc(current.title)}</h2><div class="v16-badge-row"><span>${esc(platform(current.platform).abbr)}</span>${current.releaseYear?`<span>${esc(current.releaseYear)}</span>`:''}${current.genre?`<span>${esc(current.genre)}</span>`:''}</div>${current.notes?`<p>${esc(current.notes)}</p>`:''}<button class="primary" data-v16-game-detail="${esc(current.id)}">Открыть игру</button></div><div class="v16-hero-side"><div><small>Текущая ротация</small><b>${rotationPlatforms.length?rotationPlatforms.map(x=>esc(platform(x).abbr)).join(' · '):'Свободная игра'}</b></div>${last?`<button data-v16-game-detail="${esc(last.id)}"><small>Последнее прохождение</small><b>${esc(last.title)}</b><span>${last.rating?`${last.rating}/10`:esc(platform(last.platform).abbr)}</span></button>`:''}</div></section>`;
  }

  const baseHomeV17 = renderHome;
  renderHome = function() {
    const html = baseHomeV17();
    const hero = homeHeroV17(pickHomePlaying());
    return html.replace(/^<section class="v16-home-hero[\s\S]*?<\/section>/, hero);
  };

  function backlogGamesV17() {
    return state.games.filter(g=>g&&!g.deletedAt&&g.status==='backlog').map(migrateGame);
  }

  function renderBacklogV17() {
    const games = backlogGamesV17();
    return `<div class="section-head"><div><h2>Backlog</h2><p>Игры на потом. Они не входят в библиотеку и статистику, пока ты не начнёшь прохождение.</p></div></div>
      <section class="panel v16-backlog-add"><h3>Добавить в Backlog</h3>
        <form id="v17BacklogForm" class="v16-backlog-form v17-backlog-form" autocomplete="off">
          <div class="v17-catalog-field"><input name="title" required maxlength="160" placeholder="Название игры" data-v17-backlog-title><div class="v17-catalog-suggestions" data-v17-backlog-suggestions hidden></div></div>
          <select name="platform" data-v17-backlog-platform>${mcOwnedPlatforms().map(id=>`<option value="${id}">${esc(platform(id).name)}</option>`).join('')}</select>
          <input name="releaseYear" maxlength="4" inputmode="numeric" placeholder="Год">
          <input name="genre" maxlength="80" placeholder="Жанр">
          <input name="franchise" maxlength="100" placeholder="Франшиза">
          <textarea name="notes" rows="2" maxlength="1000" placeholder="Почему хочу пройти / заметка"></textarea>
          <button class="primary" type="submit">+ В Backlog</button>
        </form>
      </section>
      <section class="panel"><div class="section-head"><div><h3>Очередь</h3><p>${games.length} ${games.length===1?'игра':'игр'}</p></div></div>
        ${games.length?`<div class="v16-backlog-grid">${games.map(g=>`<article class="v16-backlog-card">${coverMarkup(g,'v16-backlog-cover')}<div><span class="v16-platform-pill">${esc(platform(g.platform).abbr)}</span><h3>${esc(g.title)}</h3><p>${esc(g.notes||g.genre||'Без заметки')}</p><div class="v16-card-actions"><button class="primary compact" data-v16-backlog-start="${esc(g.id)}">Начинаю проходить</button><button class="ghost compact" data-v16-backlog-remove="${esc(g.id)}">Удалить</button></div></div></article>`).join('')}</div>`:'<div class="empty">Backlog пуст. Добавь сюда игры, которые хочешь когда-нибудь начать.</div>'}
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
    if (!items.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.innerHTML = items.map((item,i)=>`<button type="button" data-v17-backlog-suggestion="${i}" data-title="${esc(item.title)}" data-year="${esc(item.releaseYear||'')}" data-genre="${esc(item.genre||'')}" data-franchise="${esc(item.franchise||'')}" data-cover="${esc(item.coverUrl||'')}"><b>${esc(item.title)}</b><span>${esc(item.releaseYear||'Год не указан')} · ${esc(platform(pid).abbr)}</span></button>`).join('');
    box.hidden = false;
  }

  function exactCatalogMatch(pid,title) {
    const wanted = norm(title);
    return catalogSearch(pid,title).find(x=>norm(x.title)===wanted) || null;
  }

  async function saveBacklogV17(form) {
    const fd = new FormData(form);
    let title = String(fd.get('title')||'').trim();
    const pid = String(fd.get('platform')||'');
    if (!title || !pid) return;
    const match = exactCatalogMatch(pid,title);
    if (match?.title) title = match.title;
    const now = nowIso();
    const g = migrateGame({
      id: crypto.randomUUID ? crypto.randomUUID() : `b-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title, platform:pid, status:'backlog',
      releaseYear:String(fd.get('releaseYear')||match?.releaseYear||''),
      genre:String(fd.get('genre')||match?.genre||''),
      franchise:String(fd.get('franchise')||match?.franchise||''),
      notes:String(fd.get('notes')||''), rating:'', replay:0,
      coverUrl:String(match?.coverUrl||''), coverSource:String(match?.coverSource||''),
      addedAt:now, updatedAt:now
    });
    state.games.push(g);
    await persist();
    scheduleAutoSync();
    render();
    setToast('Добавлено в Backlog');
    if (!g.coverUrl) {
      try {
        const c = await fetchCoverForGame(g.title,g.releaseYear,g.platform);
        if (c?.url) { g.coverUrl=c.url; g.coverSource=c.source||''; g.updatedAt=nowIso(); await persist(); scheduleAutoSync(); render(); }
      } catch (_) {}
    }
  }

  function stripBoxartName(path='') { return String(path).split('/').pop() || ''; }
  function regionRank(path='') {
    if (/\(USA\)|\(World\)/i.test(path)) return 0;
    if (/\(Europe\)/i.test(path)) return 1;
    if (/\(Australia\)/i.test(path)) return 2;
    if (/\(Japan\)/i.test(path)) return 5;
    return 3;
  }
  async function repoBoxarts(repo) {
    if (coverIndexCache.has(repo)) return coverIndexCache.get(repo);
    const job = fetch(`https://api.github.com/repos/libretro-thumbnails/${repo}/git/trees/master?recursive=1`,{headers:{Accept:'application/vnd.github+json'}})
      .then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();})
      .then(data=>(data.tree||[]).filter(x=>x.type==='blob'&&/^Named_Boxarts\/.+\.(png|jpe?g|webp)$/i.test(x.path||'')).map(x=>x.path));
    coverIndexCache.set(repo,job);
    try { return await job; } catch (e) { coverIndexCache.delete(repo); throw e; }
  }
  function rawLibretro(repo,path) { return `https://raw.githubusercontent.com/libretro-thumbnails/${repo}/master/${String(path).split('/').map(encodeURIComponent).join('/')}`; }
  async function strictLibretroCover(game) {
    const repos = window.MemoryCardCoverSources?.libretroRepos?.[game.platform] || [];
    const wanted = canonicalTitle(game.title);
    const found = [];
    for (const repo of repos) {
      try {
        const paths = await repoBoxarts(repo);
        for (const path of paths) {
          const candidate = canonicalTitle(stripBoxartName(path));
          if (candidate === wanted) found.push({repo,path,rank:regionRank(path)});
        }
      } catch (e) { console.warn('Exact cover index failed',repo,e); }
    }
    found.sort((a,b)=>a.rank-b.rank);
    const best = found[0];
    return best ? {url:rawLibretro(best.repo,best.path),source:`libretro-exact:${best.repo}`} : null;
  }

  async function refreshOneCover(gameId, button) {
    const g = state.games.find(x=>x.id===gameId&&!x.deletedAt);
    if (!g) return;
    const oldText = button?.textContent || 'Обновить обложку';
    if (button) { button.disabled=true; button.textContent='Ищу…'; }
    try {
      let result = await strictLibretroCover(g);
      if (!result?.url) {
        const match = exactCatalogMatch(g.platform,g.title);
        if (match?.coverUrl) result={url:match.coverUrl,source:match.coverSource||'catalog-exact'};
      }
      if (!result?.url) result = await fetchCoverForGame(g.title,g.releaseYear,g.platform);
      if (!result?.url) { setToast('Другую обложку найти не удалось'); return; }
      const same = String(result.url) === String(g.coverUrl||'');
      g.coverUrl = result.url;
      g.coverSource = result.source || 'manual-cover-refresh';
      g.updatedAt = nowIso();
      await persist();
      scheduleAutoSync();
      render();
      setToast(same?'Источник вернул ту же обложку':'Обложка обновлена');
    } catch (e) {
      console.error(e); setToast('Не удалось обновить обложку');
    } finally {
      if (button?.isConnected) { button.disabled=false; button.textContent=oldText; }
    }
  }

  async function collectionAddStable(gameId, collectionId) {
    if (!gameId || !collectionId) return;
    const list = Array.isArray(state.settings.collections) ? state.settings.collections : [];
    let changed = false;
    state.settings.collections = list.map(c=>{
      if (c.id!==collectionId) return {...c,gameIds:[...(c.gameIds||[])]};
      const ids=[...new Set([...(c.gameIds||[]).map(String),String(gameId)])];
      changed = ids.length !== (c.gameIds||[]).length;
      return {...c,gameIds:ids};
    });
    if (!changed && !list.some(c=>c.id===collectionId)) return;
    state.settings.settingsUpdatedAt=nowIso();
    await persist(); scheduleAutoSync(); render(); setToast('Добавлено в коллекцию');
  }
  async function collectionRemoveStable(gameId, collectionId) {
    const list=Array.isArray(state.settings.collections)?state.settings.collections:[];
    state.settings.collections=list.map(c=>c.id===collectionId?{...c,gameIds:(c.gameIds||[]).filter(id=>String(id)!==String(gameId))}:{...c,gameIds:[...(c.gameIds||[])]});
    state.settings.settingsUpdatedAt=nowIso();
    await persist(); scheduleAutoSync(); render();
  }

  function enhanceGameDetail() {
    const hero = document.querySelector('.v16-detail-hero');
    const cover = hero?.querySelector('.v16-detail-cover, .cover');
    if (!hero || !cover || cover.closest('.v17-detail-cover-column')) return;
    const wrapper=document.createElement('div'); wrapper.className='v17-detail-cover-column';
    const btn=document.createElement('button'); btn.type='button'; btn.className='ghost compact v17-cover-refresh'; btn.dataset.v17CoverRefresh=state.gameDetailId||''; btn.textContent='↻ Обновить обложку';
    cover.before(wrapper); wrapper.append(btn,cover);
  }

  function enhanceRotationButtons() {
    document.querySelectorAll('.v16-rotation-mode').forEach(block=>{
      const select=block.querySelector('[data-v16-rotation-mode]');
      if (!select || block.querySelector('.v17-rotation-buttons')) return;
      select.classList.add('v17-rotation-select-compat');
      const group=select.dataset.v16RotationMode;
      const current=state.settings[group==='desktop'?'rotationDesktopMode':'rotationHandheldMode']||'classic';
      const box=document.createElement('div'); box.className='v17-rotation-buttons';
      box.innerHTML=[['classic','Классическая','По заданному порядку'],['balance','Баланс','Дольше не использовалась'],['random','Случайная','Новая случайная система']].map(([id,name,hint])=>`<button type="button" class="${current===id?'active':''}" data-v17-rotation-mode="${id}" data-group="${group}"><b>${name}</b><small>${hint}</small></button>`).join('');
      select.before(box);
    });
  }

  function enhanceThemes() {
    const panel=document.querySelector('.v16-accent-panel');
    const grid=panel?.querySelector('.v16-theme-swatches');
    const select=panel?.querySelector('#accentTheme');
    if (!panel || !grid || !select) return;
    EXTRA_ACCENTS.forEach(id=>{if(!select.querySelector(`option[value="${id}"]`)){const o=document.createElement('option');o.value=id;o.textContent=THEME_NAMES[id];select.appendChild(o);}});
    select.value=ALL_ACCENTS.includes(state.settings.accentTheme)?state.settings.accentTheme:'memory';
    EXTRA_ACCENTS.forEach(id=>{if(!grid.querySelector(`[data-v16-accent="${id}"]`)){const b=document.createElement('button');b.type='button';b.className='v16-swatch';b.dataset.v16Accent=id;b.title=THEME_NAMES[id];b.innerHTML='<i></i>';grid.appendChild(b);}});
    const buttons=[...grid.querySelectorAll('[data-v16-accent]')];
    buttons.forEach((b,i)=>{
      const id=b.dataset.v16Accent;
      b.classList.toggle('active',id===state.settings.accentTheme);
      if(!b.querySelector('span')){const s=document.createElement('span');s.textContent=THEME_NAMES[id]||id;b.appendChild(s);}
      b.classList.toggle('v17-theme-collapsed',!themesExpanded&&i>=8);
    });
    let toggle=panel.querySelector('[data-v17-themes-toggle]');
    if(!toggle){toggle=document.createElement('button');toggle.type='button';toggle.className='secondary compact v17-themes-toggle';toggle.dataset.v17ThemesToggle='1';panel.appendChild(toggle);}
    toggle.textContent=themesExpanded?'Скрыть дополнительные стили':`Показать все стили (${buttons.length})`;
  }

  function enhanceContrastAndAchievements() {
    document.querySelectorAll('.v16-ach-progress').forEach(progress=>{
      const p=progress.closest('.section-head')?.querySelector('p');
      if(p&&p.textContent.includes('Никакого playtime')) p.textContent='Внутренние достижения Memory Card.';
    });
  }

  function enhanceV17() { applyAccentV17(); enhanceGameDetail(); enhanceRotationButtons(); enhanceThemes(); enhanceContrastAndAchievements(); }

  const baseRenderV17=render;
  render=function(){baseRenderV17();queueMicrotask(enhanceV17);};

  let observerQueued=false;
  const app=document.querySelector('#app');
  if(app)new MutationObserver(()=>{if(observerQueued)return;observerQueued=true;queueMicrotask(()=>{observerQueued=false;enhanceV17();});}).observe(app,{childList:true,subtree:true});
  queueMicrotask(enhanceV17);

  document.addEventListener('input',e=>{ if(e.target?.matches('[data-v17-backlog-title]')) showBacklogSuggestions(e.target.closest('form')); });
  document.addEventListener('change',e=>{
    if(e.target?.matches('[data-v17-backlog-platform]')) showBacklogSuggestions(e.target.closest('form'));
    if(e.target?.matches('[data-current-group]')) {
      const group=e.target.dataset.currentGroup;
      state.settings[currentSettingKey(group)]=e.target.value;
      state.settings.settingsUpdatedAt=nowIso();
      persist().then(()=>{scheduleAutoSync(); setTimeout(()=>render(),0);});
    }
    if(e.target?.id==='accentTheme' && ALL_ACCENTS.includes(e.target.value)) {
      state.settings.accentTheme=e.target.value; state.settings.settingsUpdatedAt=nowIso();
      persist().then(()=>{applyAccentV17();render();scheduleAutoSync();});
    }
  });
  document.addEventListener('submit',e=>{ if(e.target?.id==='v17BacklogForm'){e.preventDefault();saveBacklogV17(e.target);} });

  document.addEventListener('click',e=>{
    const el=e.target instanceof Element?e.target.closest('[data-v17-backlog-suggestion],[data-v17-cover-refresh],[data-v17-rotation-mode],[data-v17-themes-toggle],[data-v16-accent]'):null;
    if(!el)return;
    if(el.dataset.v17BacklogSuggestion!==undefined){
      const form=el.closest('form'); if(!form)return;
      form.querySelector('[name="title"]').value=el.dataset.title||'';
      form.querySelector('[name="releaseYear"]').value=el.dataset.year||'';
      if(el.dataset.genre)form.querySelector('[name="genre"]').value=el.dataset.genre;
      if(el.dataset.franchise)form.querySelector('[name="franchise"]').value=el.dataset.franchise;
      const box=form.querySelector('[data-v17-backlog-suggestions]');if(box){box.hidden=true;box.innerHTML='';}
      return;
    }
    if(el.dataset.v17CoverRefresh){refreshOneCover(el.dataset.v17CoverRefresh,el);return;}
    if(el.dataset.v17RotationMode){
      const group=el.dataset.group,mode=el.dataset.v17RotationMode,key=group==='desktop'?'rotationDesktopMode':'rotationHandheldMode';
      state.settings[key]=mode;state.settings.settingsUpdatedAt=nowIso();
      const block=el.closest('.v16-rotation-mode');const select=block?.querySelector('[data-v16-rotation-mode]');if(select)select.value=mode;
      block?.querySelectorAll('[data-v17-rotation-mode]').forEach(b=>b.classList.toggle('active',b===el));
      persist().then(()=>scheduleAutoSync());return;
    }
    if(el.dataset.v17ThemesToggle){themesExpanded=!themesExpanded;enhanceThemes();return;}
    if(el.dataset.v16Accent && ALL_ACCENTS.includes(el.dataset.v16Accent)){
      e.preventDefault();e.stopImmediatePropagation();
      state.settings.accentTheme=el.dataset.v16Accent;state.settings.settingsUpdatedAt=nowIso();
      persist().then(()=>{applyAccentV17();render();scheduleAutoSync();});return;
    }
  },true);

  document.addEventListener('click',e=>{
    const add=e.target instanceof Element?e.target.closest('[data-v16-collection-add]'):null;
    const remove=e.target instanceof Element?e.target.closest('[data-v16-collection-remove-game]'):null;
    if(add){e.preventDefault();e.stopImmediatePropagation();const panel=add.closest('.panel');const select=panel?.querySelector('[data-v16-collection-select]');collectionAddStable(add.dataset.v16CollectionAdd,select?.value||'');}
    if(remove){e.preventDefault();e.stopImmediatePropagation();collectionRemoveStable(remove.dataset.gameId,remove.dataset.v16CollectionRemoveGame);}
  },true);
})();