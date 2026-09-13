/* Memory Card v0.13 — home platform limit, appearance options, EN localization and friend removal notices */
(() => {
  const HOME_LIMIT = 7;
  let homeExpanded = false;
  let lastView = '';
  let enhanceQueued = false;

  state.social = state.social || {};
  state.social.removed = Array.isArray(state.social.removed) ? state.social.removed : [];
  state.settings.language = state.settings.language === 'en' ? 'en' : 'ru';
  state.settings.reducedMotion = state.settings.reducedMotion === true || String(state.settings.reducedMotion) === 'true';

  const baseMigrateSettingsV13 = migrateSettings;
  migrateSettings = function(raw = {}) {
    const out = baseMigrateSettingsV13(raw);
    out.language = raw.language === 'en' ? 'en' : 'ru';
    out.reducedMotion = raw.reducedMotion === true || String(raw.reducedMotion) === 'true';
    return out;
  };
  state.settings = migrateSettings(state.settings || {});

  const baseSyncableSettingsV13 = syncableSettings;
  syncableSettings = function() {
    return {
      ...baseSyncableSettingsV13(),
      language: state.settings.language === 'en' ? 'en' : 'ru',
      reducedMotion: !!state.settings.reducedMotion,
    };
  };

  const baseMergeClientSettingsV13 = mergeClientSettings;
  mergeClientSettings = function(local, remote) {
    const out = baseMergeClientSettingsV13(local, remote);
    const localTs = String(local?.settingsUpdatedAt || '');
    const remoteTs = String(remote?.settingsUpdatedAt || '');
    const chosen = remoteTs > localTs ? (remote || {}) : (local || {});
    out.language = chosen.language === 'en' ? 'en' : 'ru';
    out.reducedMotion = chosen.reducedMotion === true || String(chosen.reducedMotion) === 'true';
    return out;
  };

  const baseBridgeV13 = appsScriptBridgeRequest;
  appsScriptBridgeRequest = async function(baseUrl, payload) {
    const data = await baseBridgeV13(baseUrl, payload);
    if (data?.ok) {
      const social = data.social || data;
      if (Array.isArray(social.removed)) state.social.removed = social.removed;
    }
    return data;
  };

  const exactEn = new Map(Object.entries({
    'Главная':'Home','Сейчас играю':'Playing','Игры':'Games','Лог':'Log','Статистика':'Stats','Друзья':'Friends','Настройки':'Settings',
    'Платформы':'Platforms','Открой устройство и посмотри историю прохождений.':'Open a device to view its play history.',
    'Показать все':'Show all','Скрыть':'Show less','Прошёл игру':'Finished a game','+ Прошёл игру':'+ Finished a game',
    'Портативная ротация':'Handheld rotation','Desktop-ротация':'Desktop rotation','Ротация выключена':'Rotation disabled',
    'Играй на любых выбранных устройствах без очереди.':'Play on any selected device without a fixed order.','Настроить':'Configure',
    'Сейчас в ротации':'Current in rotation','Следующая':'Next','Текущее устройство':'Current device','Включена. Настрой порядок и состав очереди.':'Enabled. Configure the order and devices.',
    'Выключена. Очерёдность не используется.':'Disabled. Rotation order is not used.','Вкл':'On','Выкл':'Off','Убрать':'Remove',
    'Оформление':'Appearance','Тема':'Theme','Системная':'System','Светлая':'Light','Тёмная':'Dark','Темная':'Dark','Язык':'Language','Анимации':'Animations',
    'Русский':'Russian','Английский':'English','Уменьшить анимации':'Reduce motion','Меньше переходов и движущихся эффектов.':'Fewer transitions and animated effects.',
    'Профиль Memory Card':'Memory Card profile','Имя':'Name','Memory Card ID':'Memory Card ID','Копировать':'Copy','Копировать ID':'Copy ID',
    'Имя можно менять. ID постоянный и нужен для друзей.':'You can change your name. Your ID is permanent and is used for friends.',
    'Публичный ID можно отправлять друзьям. Приватный ключ профиля остаётся только на устройстве и не экспортируется.':'You can share your public ID with friends. The private profile key stays on the device and is never exported.',
    'Мои приставки':'My consoles','Отметь устройства, которые используешь. Остальные исчезнут из основной работы с библиотекой.':'Select the devices you use. The rest will stay out of the main library interface.',
    'Каталог игр и обложки':'Game catalog & covers','Обновить каталог':'Refresh catalog','Обновить обложки':'Refresh covers','Восстановить локальную копию':'Restore local backup',
    'Google Sheets':'Google Sheets','Автосинхронизация':'Auto sync','Синхронизировать сейчас':'Sync now','Проверить подключение':'Test connection','Сохранить настройки':'Save settings',
    'Экспорт данных':'Export data','Импорт данных':'Import data','Экспорт JSON':'Export JSON','Импорт JSON':'Import JSON',
    'Друзья':'Friends','Смотри игровые профили друзей и их статистику.':'View your friends’ gaming profiles and stats.','Обновить':'Refresh',
    'Добавить друга':'Add friend','Поиск работает только по точному Memory Card ID.':'Search works only with an exact Memory Card ID.','Отправить приглашение':'Send request',
    'Входящие приглашения':'Incoming requests','Отклонить':'Decline','Принять':'Accept','Отправленные':'Sent','Ожидают подтверждения':'Awaiting confirmation','Ожидает':'Pending',
    'Мои друзья':'My friends','Пока никого':'No friends yet','Добавь друга по ID. Профиль станет доступен только после принятия приглашения.':'Add a friend by ID. Their profile becomes available only after they accept the request.',
    'Профиль друга':'Friend profile','Загружаю библиотеку…':'Loading library…','Получаю профиль…':'Loading profile…','← К друзьям':'← Back to friends',
    'Профиль только для просмотра':'Read-only profile','Удалить из друзей':'Remove friend','Игр пройдено':'Games completed','Средняя оценка':'Average rating','Сейчас играет':'Currently playing','Игр на 10/10':'10/10 games',
    'Приставки':'Consoles','Устройства друга':'Friend’s devices','Не указаны':'Not specified','Последние прохождения':'Recent completions','Пока нет завершённых игр.':'No completed games yet.',
    'Вас удалили из друзей':'You were removed from friends','Доступ к профилю закрыт.':'Profile access is now closed.','Удалить уведомление':'Dismiss',
    'Сначала подключи облако':'Connect cloud sync first','Открыть настройки':'Open settings','Профили Memory Card живут в закрытой облачной базе.':'Memory Card profiles live in a private cloud database.',
    'Загружаю список друзей…':'Loading friends…','Подключение к Memory Card Network…':'Connecting to Memory Card Network…','Создаю твой профиль…':'Creating your profile…','Получаю уникальный ID…':'Getting your unique ID…',
    'Название':'Title','Платформа':'Platform','Год':'Year','Жанр':'Genre','Франшиза':'Franchise','Оценка':'Rating','Комментарий':'Notes','Перепрохождение':'Replay',
    'Сохранить':'Save','Отмена':'Cancel','Удалить':'Delete','Редактировать':'Edit','Закрыть':'Close','Добавить':'Add','Поиск':'Search','Все':'All',
    'Пройдено':'Completed','Играю':'Playing','Без оценки':'Not rated','Нет игр':'No games','Ничего не найдено':'Nothing found',
    'Игровой лог':'Play log','Твоя игровая история':'Your gaming history','Всего пройдено':'Total completed','Средняя оценка':'Average rating',
    'Настройки сохранены':'Settings saved','Приглашение отправлено':'Friend request sent','Друг добавлен':'Friend added','Приглашение отклонено':'Request declined','Удалено из друзей':'Removed from friends',
    'Обновляю каталог':'Refreshing catalog','Каталог обновлён':'Catalog updated','Каталог не обновлён':'Catalog not updated','Подготовка…':'Preparing…','готово':'done',
    'Профиль Memory Card':'Memory Card profile','Профиль готов':'Profile ready','Подключаюсь к базе':'Connecting to database','Друзья обновлены':'Friends updated','Обновляю список':'Refreshing list',
    'Приглашение':'Friend request','Не удалось отправить':'Could not send','Не удалось обновить друзей':'Could not refresh friends','Не удалось подключить профиль':'Could not connect profile',
    'Выбранные приставки':'Selected consoles','Показаны только приставки из настроек «Мои приставки».':'Only consoles selected in “My consoles” are shown here.'
  }));

  const placeholderEn = new Map(Object.entries({
    'Поиск по названию':'Search by title','Название игры':'Game title','Комментарий':'Notes','MC-AB12-CD34':'MC-AB12-CD34',
    'Например: Metroid':'For example: Metroid','Например: 2004':'For example: 2004'
  }));

  function translateString(value) {
    if (state.settings.language !== 'en') return value;
    const original = String(value ?? '');
    const trimmed = original.trim();
    if (!trimmed) return original;
    if (exactEn.has(trimmed)) return original.replace(trimmed, exactEn.get(trimmed));
    let match;
    if ((match = trimmed.match(/^(\d+) пройдено$/))) return original.replace(trimmed, `${match[1]} completed`);
    if ((match = trimmed.match(/^(\d+) играет$/))) return original.replace(trimmed, `${match[1]} playing`);
    if ((match = trimmed.match(/^(\d+) в списке$/))) return original.replace(trimmed, `${match[1]} friends`);
    if ((match = trimmed.match(/^(\d+) друзей$/))) return original.replace(trimmed, `${match[1]} friends`);
    if ((match = trimmed.match(/^(\d+) всего$/))) return original.replace(trimmed, `${match[1]} total`);
    if ((match = trimmed.match(/^(\d+) из (\d+) платформ$/))) return original.replace(trimmed, `${match[1]} of ${match[2]} platforms`);
    if ((match = trimmed.match(/^(\d+) в очереди$/))) return original.replace(trimmed, `${match[1]} in rotation`);
    if ((match = trimmed.match(/^Показать все \((\d+)\)$/))) return original.replace(trimmed, `Show all (${match[1]})`);
    if ((match = trimmed.match(/^(.+) удалил(?:а)? вас из друзей\.$/))) return original.replace(trimmed, `${match[1]} removed you from friends.`);
    return original;
  }

  function shouldSkipText(node) {
    const parent = node.parentElement;
    if (!parent) return true;
    return !!parent.closest('.game-title,.platform-name,.platform-abbr,.memory-id,input,textarea,code,pre,[data-no-i18n]');
  }

  function translateDom(root = document) {
    document.documentElement.lang = state.settings.language === 'en' ? 'en' : 'ru';
    if (state.settings.language !== 'en') return;
    const walker = document.createTreeWalker(root === document ? document.body : root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (shouldSkipText(node)) continue;
      const next = translateString(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
    }
    document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => {
      const value = el.getAttribute('placeholder') || '';
      const translated = placeholderEn.get(value) || translateString(value);
      if (translated !== value) el.setAttribute('placeholder', translated);
    });
    document.querySelectorAll('[title]').forEach(el => {
      const value = el.getAttribute('title') || '';
      const translated = translateString(value);
      if (translated !== value) el.setAttribute('title', translated);
    });
  }

  function applyAppearance() {
    document.documentElement.classList.toggle('mc-reduced-motion', !!state.settings.reducedMotion);
    const theme = document.querySelector('#themeMode');
    if (!theme) return;
    const panel = theme.closest('.panel');
    if (!panel) return;
    if (!panel.querySelector('#languageMode')) {
      const wrap = document.createElement('div');
      wrap.className = 'appearance-extra-grid';
      wrap.innerHTML = `<div class="field"><label>Язык</label><select id="languageMode"><option value="ru" ${state.settings.language==='ru'?'selected':''}>Русский</option><option value="en" ${state.settings.language==='en'?'selected':''}>Английский</option></select></div><label class="appearance-toggle"><span><b>Анимации</b><small class="status-line">Уменьшить анимации</small></span><input id="reducedMotionMode" type="checkbox" ${state.settings.reducedMotion?'checked':''}></label>`;
      panel.appendChild(wrap);
    }
  }

  function applyHomePlatforms() {
    if (state.view !== 'home') return;
    const cards = [...document.querySelectorAll('.platform-card[data-platform]')];
    if (!cards.length) return;
    const container = cards[0].parentElement;
    if (!container) return;
    const selectedIds = [...new Set((state.settings.ownedPlatforms || []).filter(id => PLATFORMS.some(p => p.id === id)))];
    const selected = selectedIds.map(id => cards.find(card => card.dataset.platform === id)).filter(Boolean);
    const selectedSet = new Set(selectedIds);
    cards.forEach(card => {
      card.classList.toggle('mc-platform-hidden', !selectedSet.has(card.dataset.platform));
      card.classList.remove('mc-platform-collapsed');
    });
    selected.forEach(card => container.appendChild(card));
    selected.forEach((card, index) => card.classList.toggle('mc-platform-collapsed', !homeExpanded && index >= HOME_LIMIT));
    document.querySelector('.home-platform-toggle-row')?.remove();
    if (selected.length > HOME_LIMIT) {
      const row = document.createElement('div');
      row.className = 'home-platform-toggle-row';
      row.innerHTML = `<button class="secondary" type="button" data-action="home-platform-toggle">${homeExpanded ? 'Скрыть' : `Показать все (${selected.length})`}</button>`;
      container.insertAdjacentElement('afterend', row);
    }
  }

  function removedNoticeMarkup(items) {
    return `<section class="panel friend-removed-panel" data-friend-removed-panel><div class="section-head"><div><h3>Вас удалили из друзей</h3><p>Доступ к профилю закрыт.</p></div></div><div class="friend-removed-list">${items.map(item => `<article class="friend-removed-row"><div class="social-avatar small">${esc((item.displayName||'И')[0].toUpperCase())}</div><div class="friend-removed-main"><div class="game-title" data-no-i18n>${esc(item.displayName||'Игрок')}</div><div class="status-line">${esc(item.displayName||'Игрок')} удалил вас из друзей.</div><div class="memory-id">${esc(item.userId||'')}</div></div><div class="friend-actions"><button class="secondary compact" data-action="friend-dismiss-removed" data-friend-id="${esc(item.userId||'')}">Удалить уведомление</button></div></article>`).join('')}</div></section>`;
  }

  function applyFriendRemovedNotices() {
    document.querySelector('[data-friend-removed-panel]')?.remove();
    if (state.view !== 'friends' || state.friendProfile) return;
    const items = Array.isArray(state.social.removed) ? state.social.removed : [];
    if (!items.length) return;
    const addPanel = document.querySelector('.friend-add-panel');
    if (!addPanel) return;
    addPanel.insertAdjacentHTML('beforebegin', removedNoticeMarkup(items));
  }

  function enhance() {
    enhanceQueued = false;
    if (lastView !== state.view) {
      if (state.view === 'home') homeExpanded = false;
      lastView = state.view;
    }
    applyAppearance();
    applyHomePlatforms();
    applyFriendRemovedNotices();
    translateDom();
  }

  function queueEnhance() {
    if (enhanceQueued) return;
    enhanceQueued = true;
    requestAnimationFrame(enhance);
  }

  const baseRenderV13 = render;
  render = function() {
    baseRenderV13();
    queueEnhance();
  };

  document.addEventListener('change', event => {
    if (event.target?.id === 'languageMode') {
      state.settings.language = event.target.value === 'en' ? 'en' : 'ru';
      state.settings.settingsUpdatedAt = nowIso();
      persist();
      render();
      scheduleAutoSync?.();
    }
    if (event.target?.id === 'reducedMotionMode') {
      state.settings.reducedMotion = !!event.target.checked;
      state.settings.settingsUpdatedAt = nowIso();
      persist();
      applyAppearance();
      scheduleAutoSync?.();
    }
  });

  document.addEventListener('click', async event => {
    const toggle = event.target?.closest?.('[data-action="home-platform-toggle"]');
    if (toggle) {
      event.preventDefault();
      homeExpanded = !homeExpanded;
      applyHomePlatforms();
      translateDom();
      return;
    }
    const dismiss = event.target?.closest?.('[data-action="friend-dismiss-removed"]');
    if (dismiss) {
      event.preventDefault();
      const friendId = String(dismiss.dataset.friendId || '').toUpperCase();
      if (!friendId || !state.settings.sheetEndpoint || !state.settings.userId || !state.settings.authToken) return;
      dismiss.disabled = true;
      try {
        const data = await appsScriptBridgeRequest(state.settings.sheetEndpoint, {action:'friendDismiss', userId:state.settings.userId, authToken:state.settings.authToken, friendId});
        if (!data?.ok) throw new Error(data?.error || 'Не удалось удалить уведомление');
        state.social.removed = (state.social.removed || []).filter(x => String(x.userId || '').toUpperCase() !== friendId);
        render();
      } catch (error) {
        dismiss.disabled = false;
        alert(error?.message || String(error));
      }
    }
  }, true);

  const originalConfirm = window.confirm.bind(window);
  window.confirm = message => originalConfirm(translateString(message));
  const originalAlert = window.alert.bind(window);
  window.alert = message => originalAlert(translateString(message));

  const observer = new MutationObserver(queueEnhance);
  observer.observe(document.body, {childList:true, subtree:true});
  window.addEventListener('load', queueEnhance);
  setTimeout(queueEnhance, 0);
})();
