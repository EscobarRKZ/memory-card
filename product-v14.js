/* Memory Card v0.14 — stats cleanup, compact settings and library view modes */
(() => {
  const CONSOLE_LIMIT = 8;
  const FRANCHISE_LIMIT = 8;
  const VIEW_KEY = 'memory-card-games-view-v2';
  let consolesExpanded = false;
  let franchisesExpanded = false;
  let queued = false;

  const isEn = () => state?.settings?.language === 'en';
  const tr = (ru, en) => isEn() ? en : ru;
  const ownedIds = () => [...new Set((state?.settings?.ownedPlatforms || []).filter(id => PLATFORMS.some(p => p.id === id)))];

  function readView() {
    try {
      const v = localStorage.getItem(VIEW_KEY) || '4';
      return ['1','4','6','8'].includes(v) ? v : '4';
    } catch (_) { return '4'; }
  }
  function writeView(v) {
    try { localStorage.setItem(VIEW_KEY, v); } catch (_) {}
  }

  renderStats = function() {
    const games = liveGames();
    const completed = games.filter(g => g.status === 'completed');
    const playing = games.filter(g => g.status === 'playing');
    const ratings = completed.map(g => Number(g.rating)).filter(n => n > 0);
    const counts = countsByPlatform();
    const selected = new Set(ownedIds());
    const visiblePlatforms = PLATFORMS.filter(p => selected.has(p.id));
    const favorite = visiblePlatforms.map(p => [p.id, counts[p.id] || 0]).sort((a,b) => b[1] - a[1])[0];
    const tens = completed.filter(g => Number(g.rating) === 10).length;

    const franchiseCounts = {};
    games.forEach(g => {
      const f = inferFranchise(g.title, g.franchise);
      if (f) franchiseCounts[f] = (franchiseCounts[f] || 0) + 1;
    });
    const franchises = Object.entries(franchiseCounts).sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const maxFranchise = franchises[0]?.[1] || 1;

    const platformRows = visiblePlatforms.map(p => `<div class="game-row static-row stats-platform-row" data-stats-platform="${p.id}"><div class="platform-inline">${platformIcon(p.id)}<div><div class="game-title">${esc(p.name)}</div><div class="meta">${p.group === 'handheld' ? tr('Портативная','Handheld') : 'Desktop'}</div></div></div><div class="rating">${counts[p.id] || 0}</div></div>`).join('');

    const franchiseRows = franchises.map(([name,count], index) => `<div class="franchise-stat v14-franchise ${!franchisesExpanded && index >= FRANCHISE_LIMIT ? 'v14-franchise-collapsed' : ''}" style="--franchiseHue:${franchiseHue(name)};--franchiseShare:${Math.max(8, Math.round(count / maxFranchise * 100))}%"><div class="franchise-stat-main"><span>${esc(name)}</span><strong>${count}</strong></div><i aria-hidden="true"></i></div>`).join('');
    const franchiseToggle = franchises.length > FRANCHISE_LIMIT ? `<div class="v14-center-action"><button type="button" class="secondary compact" data-v14-action="franchises-toggle">${franchisesExpanded ? tr('Скрыть','Show less') : tr(`Показать все франшизы (${franchises.length})`,`Show all franchises (${franchises.length})`)}</button></div>` : '';

    return `<div class="section-head"><div><h2>${tr('Статистика','Stats')}</h2><p>${tr('Твой игровой архив в цифрах.','Your gaming archive in numbers.')}</p></div></div>
      <div class="stats"><div class="stat-card v14-stat-accent"><div class="stat-value">${completed.length}</div><div class="stat-label">${tr('Игр пройдено','Games completed')}</div></div><div class="stat-card"><div class="stat-value">${ratings.length ? (ratings.reduce((a,b)=>a+b,0)/ratings.length).toFixed(1) : '—'}</div><div class="stat-label">${tr('Средняя оценка','Average rating')}</div></div><div class="stat-card"><div class="stat-value">${playing.length}</div><div class="stat-label">${tr('Сейчас играю','Currently playing')}</div></div><div class="stat-card"><div class="stat-value">${tens}</div><div class="stat-label">${tr('Игр на 10/10','10/10 games')}</div></div></div>
      <section class="panel stats-platforms"><div class="section-head"><div><h2 class="h3">${tr('По платформам','By platform')}</h2><p>${tr('Только приставки из «Мои приставки».','Only consoles selected in “My consoles”.')}</p></div></div><div class="list">${platformRows || `<div class="empty">${tr('Выбери приставки в настройках.','Select consoles in settings.')}</div>`}</div>${favorite && favorite[1] ? `<div class="footer-note">${tr('Чаще всего пройдено на','Most games completed on')} ${esc(platform(favorite[0]).name)}.</div>` : ''}</section>
      ${franchises.length ? `<section class="panel franchise-stats v14-franchise-panel"><div class="section-head"><div><h2 class="h3">${tr('Франшизы','Franchises')}</h2><p>${tr('Учитываются все заполненные и распознанные франшизы в библиотеке.','Includes every filled or recognized franchise in your library.')}</p></div><span class="v14-count-pill">${franchises.length}</span></div><div class="franchise-grid v14-franchise-grid">${franchiseRows}</div>${franchiseToggle}</section>` : ''}`;
  };

  function enhanceConsolePicker() {
    const picker = document.querySelector('.console-picker');
    if (!picker) return;
    let choices = [...picker.querySelectorAll('.console-choice')];
    if (!choices.length) return;
    choices.forEach((el,i) => { if (!el.dataset.v14Order) el.dataset.v14Order = String(i + 1); });
    choices.sort((a,b) => {
      const ac = a.querySelector('input')?.checked ? 1 : 0;
      const bc = b.querySelector('input')?.checked ? 1 : 0;
      return bc - ac || Number(a.dataset.v14Order) - Number(b.dataset.v14Order);
    });
    choices.forEach(el => picker.appendChild(el));
    choices.forEach((el,i) => el.classList.toggle('v14-console-collapsed', !consolesExpanded && i >= CONSOLE_LIMIT));

    const panel = picker.closest('.panel');
    if (!panel) return;
    panel.querySelector('.v14-console-footer')?.remove();
    const selectedCount = choices.filter(el => el.querySelector('input')?.checked).length;
    const footer = document.createElement('div');
    footer.className = 'v14-console-footer';
    footer.innerHTML = `<span class="v14-count-pill">${selectedCount} ${tr('выбрано','selected')}</span>${choices.length > CONSOLE_LIMIT ? `<button type="button" class="secondary compact" data-v14-action="consoles-toggle">${consolesExpanded ? tr('Скрыть','Show less') : tr(`Показать все приставки (${choices.length})`,`Show all consoles (${choices.length})`)}</button>` : ''}`;
    picker.insertAdjacentElement('afterend', footer);
  }

  function enhanceAppearance() {
    const wrap = document.querySelector('.appearance-extra-grid');
    if (!wrap) return;
    wrap.classList.add('v14-appearance-grid');
    const toggle = wrap.querySelector('.appearance-toggle');
    if (toggle) {
      toggle.classList.add('v14-switch-row');
      const small = toggle.querySelector('small');
      if (small) small.textContent = tr('Меньше переходов и движущихся эффектов.','Fewer transitions and moving effects.');
    }
  }

  function enhanceCatalogButtons() {
    const selectedBtn = document.querySelector('[data-action="catalog-refresh-all"]');
    if (!selectedBtn || document.querySelector('[data-action="catalog-refresh-everything"]')) return;
    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'secondary';
    allBtn.dataset.action = 'catalog-refresh-everything';
    allBtn.textContent = tr('Обновить каталог всех приставок','Refresh all console catalogs');
    selectedBtn.insertAdjacentElement('afterend', allBtn);
  }

  function ensureGamesViewControl() {
    const search = document.querySelector('#search');
    const toolbar = search?.closest('.toolbar');
    if (!toolbar) return;
    let select = toolbar.querySelector('#gamesView');
    if (!select) {
      const field = document.createElement('div');
      field.className = 'field games-view-field';
      field.innerHTML = `<label for="gamesView">${tr('Вид отображения','View')}</label><select id="gamesView"><option value="4">${tr('4 в ряд','4 columns')}</option><option value="6">${tr('6 в ряд','6 columns')}</option><option value="8">${tr('8 в ряд','8 columns')}</option><option value="1">${tr('1 в ряд — подробно','1 row — detailed')}</option></select>`;
      const sortField = toolbar.querySelector('#gamesSort')?.closest('.field');
      if (sortField) sortField.insertAdjacentElement('afterend', field); else toolbar.appendChild(field);
      select = field.querySelector('#gamesView');
      select.addEventListener('change', () => { writeView(select.value); applyGameView(); });
    }
    select.value = readView();
  }

  function addListDetails(card) {
    if (card.querySelector('.v14-list-extra')) return;
    const id = card.dataset.game;
    const g = state.games.find(x => x.id === id && !x.deletedAt);
    if (!g) return;
    const body = card.querySelector('.game-body');
    if (!body) return;
    const extra = document.createElement('div');
    extra.className = 'v14-list-extra';
    const note = String(g.notes || '').trim();
    extra.innerHTML = `<div class="v14-list-rating">${g.rating ? `<span class="v14-stars">${ratingStars(g.rating)}</span><b>${g.rating}/10</b>` : `<span class="meta">${tr('Без оценки','Not rated')}</span>`}</div><div class="v14-list-notes ${note ? '' : 'is-empty'}">${note ? esc(note) : tr('Комментарий не добавлен.','No notes added.')}</div>`;
    body.appendChild(extra);
  }

  function applyGameView() {
    const grid = document.querySelector('.game-grid');
    if (!grid) return;
    const view = readView();
    grid.classList.remove('v14-view-1','v14-view-4','v14-view-6','v14-view-8');
    grid.classList.add(`v14-view-${view}`);
    grid.querySelectorAll('.game-card').forEach(card => {
      if (view === '1') addListDetails(card);
      else card.querySelector('.v14-list-extra')?.remove();
    });
  }

  function enhance() {
    enhanceConsolePicker();
    enhanceAppearance();
    enhanceCatalogButtons();
    ensureGamesViewControl();
    applyGameView();
  }

  function schedule() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; enhance(); });
  }

  document.addEventListener('click', event => {
    const btn = event.target instanceof Element ? event.target.closest('[data-v14-action]') : null;
    if (!btn) return;
    const action = btn.dataset.v14Action;
    if (action === 'consoles-toggle') {
      event.preventDefault();
      consolesExpanded = !consolesExpanded;
      enhanceConsolePicker();
    }
    if (action === 'franchises-toggle') {
      event.preventDefault();
      franchisesExpanded = !franchisesExpanded;
      render();
    }
  });

  const app = document.querySelector('#app');
  if (app) new MutationObserver(schedule).observe(app, {childList:true, subtree:true});
  window.addEventListener('load', schedule);
  window.addEventListener('pageshow', schedule);
  schedule();
})();
