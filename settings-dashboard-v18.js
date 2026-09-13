(() => {
  const TAB_KEY = 'memory-card-settings-tab-v1';
  const TAB_IDS = ['basic', 'rotation', 'appearance', 'catalog', 'data'];

  const tr = (ru, en) => state?.settings?.language === 'en' ? en : ru;

  function activeTab() {
    try {
      const saved = localStorage.getItem(TAB_KEY) || 'basic';
      return TAB_IDS.includes(saved) ? saved : 'basic';
    } catch (_) {
      return 'basic';
    }
  }

  function stripLastCompletedFromHero(html) {
    return String(html || '').replace(
      /<button\b[^>]*data-v16-game-detail="[^"]*"[^>]*>\s*<small>Последнее прохождение<\/small>[\s\S]*?<\/button>/,
      ''
    );
  }

  const baseRenderHomeV174 = renderHome;
  renderHome = function() {
    return stripLastCompletedFromHero(baseRenderHomeV174());
  };

  function catalogDashboardMarkup() {
    const counts = typeof catalogCounts === 'function' ? catalogCounts() : {};
    const rows = PLATFORMS.map(p => ({ ...p, count: Number(counts[p.id] || 0) }));
    const total = rows.reduce((sum, p) => sum + p.count, 0);
    const populated = rows.filter(p => p.count > 0).length;
    const owned = typeof mcOwnedPlatforms === 'function' ? mcOwnedPlatforms() : PLATFORMS.map(p => p.id);

    return `<section class="panel mc-catalog-panel" data-settings-category="catalog">
      <div class="mc-catalog-hero">
        <div class="mc-catalog-copy">
          <span class="mc-settings-eyebrow">${tr('Игровая база','Game database')}</span>
          <h3>${tr('Каталоги и обложки','Catalogs & covers')}</h3>
          <p>${tr('Каталог подставляет название, год и жанр, а источники box art отвечают за корректные обложки. Обновляй только свои системы или всю базу целиком.','The catalog fills title, year and genre, while box-art sources provide game covers. Refresh your systems or the entire database.')}</p>
          <div class="mc-catalog-summary">
            <span><b>${total.toLocaleString('ru-RU')}</b><small>${tr('игр в локальном каталоге','games in local catalog')}</small></span>
            <span><b>${populated}/${rows.length}</b><small>${tr('платформ с данными','platforms with data')}</small></span>
            <span><b>${owned.length}</b><small>${tr('моих приставок','my consoles')}</small></span>
          </div>
        </div>
        <div class="mc-catalog-actions">
          <button type="button" class="mc-catalog-action primary" data-action="catalog-refresh-all">
            <span class="mc-catalog-action-icon">↻</span><span><b>${tr('Обновить мои каталоги','Refresh my catalogs')}</b><small>${tr('Только выбранные приставки','Selected consoles only')}</small></span>
          </button>
          <button type="button" class="mc-catalog-action secondary" data-action="catalog-refresh-everything">
            <span class="mc-catalog-action-icon">▦</span><span><b>${tr('Все приставки','All consoles')}</b><small>${tr('Полная база платформ','Full platform database')}</small></span>
          </button>
          <button type="button" class="mc-catalog-action secondary" data-action="covers-refresh">
            <span class="mc-catalog-action-icon">▣</span><span><b>${tr('Обновить обложки','Refresh covers')}</b><small>${tr('Для игр в моей библиотеке','Games in my library')}</small></span>
          </button>
        </div>
      </div>
      <div class="mc-catalog-platforms-head"><b>${tr('Наполнение по платформам','Catalog coverage by platform')}</b><span>${tr('0 означает, что локальный каталог для системы пока не загружен','0 means that platform catalog is not loaded yet')}</span></div>
      <div id="catalogStatus" class="mc-catalog-platforms">
        ${rows.map(p => `<span class="mc-catalog-platform ${p.count ? '' : 'is-empty'}" title="${esc(p.name)}"><b>${esc(p.abbr)}</b><strong>${p.count.toLocaleString('ru-RU')}</strong></span>`).join('')}
      </div>
      <div class="mc-catalog-note"><span>✓</span><p>${tr('Если надёжная обложка не найдена, Memory Card оставит аккуратную цветную заглушку. Для конкретной неправильной обложки используй «Обновить обложку» на странице игры.','If a reliable cover cannot be found, Memory Card keeps a clean placeholder. For a specific wrong cover, use “Refresh cover” on the game page.')}</p></div>
    </section>`;
  }

  function categoryFor(node) {
    if (!(node instanceof Element)) return 'basic';
    if (node.matches('.rotation-settings-grid')) return 'rotation';
    if (node.matches('.profile-settings-card, .consoles-settings, .console-settings, .owned-platforms-settings')) return 'basic';
    if (node.matches('.v16-accent-panel')) return 'appearance';

    const heading = (node.querySelector('h3')?.textContent || '').trim().toLowerCase();
    if (/каталог|catalog/.test(heading)) return 'catalog';
    if (/оформ|appearance|акцент|accent/.test(heading)) return 'appearance';
    if (/google sheets|синхрон|sync|резерв|backup/.test(heading)) return 'data';
    if (/ротац|rotation/.test(heading)) return 'rotation';
    if (/профил|profile|пристав|console/.test(heading)) return 'basic';
    return 'basic';
  }

  function tabsMarkup(current) {
    const tabs = [
      ['basic', '◉', tr('Основное','General')],
      ['rotation', '↻', tr('Ротация','Rotation')],
      ['appearance', '✦', tr('Оформление','Appearance')],
      ['catalog', '▦', tr('Каталоги','Catalogs')],
      ['data', '⇅', tr('Данные и sync','Data & sync')],
    ];
    return `<div class="mc-settings-tabs-wrap">
      <div class="mc-settings-tabs" role="tablist" aria-label="${tr('Разделы настроек','Settings sections')}">
        ${tabs.map(([id, icon, label]) => `<button type="button" role="tab" class="mc-settings-tab ${current === id ? 'active' : ''}" data-settings-tab="${id}" aria-selected="${current === id ? 'true' : 'false'}"><span>${icon}</span>${label}</button>`).join('')}
      </div>
      <button type="button" class="primary compact mc-settings-save" data-action="save-settings">${tr('Сохранить','Save')}</button>
    </div>`;
  }

  function rebuildSettings(html) {
    const host = document.createElement('div');
    host.innerHTML = String(html || '');
    const grid = host.querySelector('.settings-grid');
    if (!grid) return html;

    const accent = host.querySelector('.v16-accent-panel');
    if (accent && !grid.contains(accent)) grid.appendChild(accent);

    const directChildren = [...grid.children];
    for (const child of directChildren) {
      const heading = (child.querySelector?.('h3')?.textContent || '').trim().toLowerCase();
      if (/каталог игр и обложки|game catalog/.test(heading)) {
        const template = document.createElement('template');
        template.innerHTML = catalogDashboardMarkup().trim();
        child.replaceWith(template.content.firstElementChild);
        continue;
      }
      child.dataset.settingsCategory = categoryFor(child);
    }

    const catalog = [...grid.children].find(x => x.dataset.settingsCategory === 'catalog');
    if (catalog && !catalog.classList.contains('mc-catalog-panel')) {
      const template = document.createElement('template');
      template.innerHTML = catalogDashboardMarkup().trim();
      catalog.replaceWith(template.content.firstElementChild);
    }

    const current = activeTab();
    grid.dataset.settingsActive = current;
    grid.classList.add('mc-settings-grid');

    const head = host.querySelector('.section-head');
    if (head) {
      const sub = head.querySelector('p');
      if (sub) sub.textContent = tr('Настрой приложение по разделам — без длинного полотна из десятка блоков.','Configure the app by section instead of one long settings page.');
      head.insertAdjacentHTML('afterend', tabsMarkup(current));
    } else {
      grid.insertAdjacentHTML('beforebegin', tabsMarkup(current));
    }

    return host.innerHTML;
  }

  const baseRenderSettingsV174 = renderSettings;
  renderSettings = function() {
    return rebuildSettings(baseRenderSettingsV174());
  };

  document.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest('[data-settings-tab]') : null;
    if (!button) return;
    const id = button.dataset.settingsTab || '';
    if (!TAB_IDS.includes(id)) return;
    event.preventDefault();
    try { localStorage.setItem(TAB_KEY, id); } catch (_) {}

    const grid = document.querySelector('.settings-grid.mc-settings-grid');
    if (grid) grid.dataset.settingsActive = id;
    document.querySelectorAll('[data-settings-tab]').forEach(tab => {
      const on = tab.dataset.settingsTab === id;
      tab.classList.toggle('active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }, true);
})();
