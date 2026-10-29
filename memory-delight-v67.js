/* v67: restrained, theme-aware details. No new storage writes or cloud calls. */
(() => {
  'use strict';
  const tr = (ru, en) => state?.settings?.language === 'en' ? en : ru;
  const paths = {
    completed: '<path d="m5 12 4 4L19 6"/>',
    playing: '<path d="m8 5 11 7-11 7z"/>',
    dropped: '<path d="M6 12h12"/>',
    backlog: '<path d="M6 3h12v18l-6-4-6 4z"/>'
  };
  const names = {
    completed: ['Пройдено', 'Completed'], playing: ['Играю', 'Playing'],
    dropped: ['Брошено', 'Dropped'], backlog: ['Хочу пройти', 'Want to play']
  };
  const glyph = status => `<svg class="mc-entry-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[status] || ''}</svg>`;
  const memoryIcon = '<svg class="mc-memory-mark" viewBox="0 0 32 36" fill="none" aria-hidden="true" focusable="false"><path d="M7 2h15l5 5v25a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.7"/><rect x="10" y="8" width="12" height="11" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M10 27v4m4-4v4m4-4v4m4-4v4" stroke="currentColor" stroke-width="1.7"/><circle class="mc-memory-led" cx="23" cy="23" r="2" fill="currentColor"/></svg>';
  let feedback = null, highlight = null, frame = 0, sequence = 0, toastGeneration = 0;
  const savingForms = new WeakSet();

  function statusChip(element, status) {
    if (!element || !names[status]) return;
    const label = tr(...names[status]);
    if (element.dataset.mcEntryStatus === status && element.dataset.mcEntryLabel === label) return;
    element.dataset.mcEntryStatus = status;
    element.dataset.mcEntryLabel = label;
    // The caller identifies status chips only. Platform, franchise and rating stay intact.
    element.replaceChildren();
    element.insertAdjacentHTML('beforeend', glyph(status));
    const text = document.createElement('span'); text.textContent = label;
    element.appendChild(text);
  }

  function decorateFeedback() {
    if (!feedback || Date.now() > feedback.expires || state.toast !== feedback.source || toastGeneration !== feedback.generation) return;
    const toast = document.querySelector('#app .toast');
    if (!toast || toast.dataset.mcMemoryFeedback === String(feedback.sequence)) return;
    toast.dataset.mcMemoryFeedback = String(feedback.sequence);
    toast.classList.add('mc-memory-feedback');
    toast.classList.toggle('mc-memory-unconfirmed', !feedback.confirmed);
    toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite');
    toast.setAttribute('aria-atomic', 'true');
    const heading = document.createElement('b');
    heading.textContent = feedback.confirmed
      ? tr('Записано на карту', 'Written to your Memory Card')
      : tr('Сохранение не подтверждено', 'Save could not be verified');
    const detail = document.createElement('small');
    detail.textContent = feedback.confirmed
      ? tr('Сохранено на этом устройстве', 'Saved on this device')
      : tr('Проверь запись перед закрытием приложения.', 'Check your entry before closing the app.');
    const text = document.createElement('span'); text.append(heading, detail);
    toast.replaceChildren(); toast.insertAdjacentHTML('beforeend', memoryIcon); toast.appendChild(text);
  }

  function enhance() {
    frame = 0;
    const games = new Map((state.games || []).filter(g => g && !g.deletedAt).map(g => [String(g.id), g]));
    document.querySelectorAll('.game-card[data-game]').forEach(card => {
      const game = games.get(String(card.dataset.game)); if (!game) return;
      const chip = card.querySelector('[data-mc-entry-status]') || [...card.querySelectorAll('.chips > .chip')].find(el =>
        !el.matches('.franchise-chip,.stars-chip') && /^(Пройдено|Играю|Брошено|Хочу пройти|Completed|Playing|Dropped|Want to play)$/i.test(el.textContent.trim())
      );
      statusChip(chip, game.status);
      const rating = card.querySelector('.stars-chip');
      if (rating) rating.classList.toggle('mc-perfect-rating', Number(game.rating) === 10);
    });
    const detail = document.querySelector('.v16-detail');
    const game = games.get(String(state.gameDetailId || ''));
    if (detail && game) {
      statusChip(detail.querySelector('.v16-detail-copy > .v16-badge-row > span:last-child'), game.status);
      detail.querySelector('.v16-detail-rating')?.classList.toggle('mc-perfect-rating', Number(game.rating) === 10);
    }
    document.querySelectorAll('.v16-notes').forEach(note => {
      note.classList.toggle('mc-personal-note', !!note.textContent.trim() && !note.querySelector('.muted'));
    });
    decorateFeedback();
    if (!highlight || highlight.used || Date.now() > highlight.expires) return;
    const target = [...document.querySelectorAll('.game-card[data-game]')].find(el => String(el.dataset.game) === highlight.id)
      || (detail && String(state.gameDetailId) === highlight.id ? detail : null);
    if (!target || target.hidden || !target.getClientRects().length) return;
    const rect = target.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= innerHeight) return;
    highlight.used = true;
    target.classList.add('mc-record-saved');
    setTimeout(() => target.classList.remove('mc-record-saved'), 1500);
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(enhance); }

  // Read-only verification: legacy persistence catches some storage errors.
  // Never decorate a save as successful merely because its promise resolved.
  async function storedMatch(expected) {
    let db;
    try {
      db = await dbOpen();
      return await new Promise(resolve => {
        let value = null, settled = false;
        const finish = result => { if (!settled) { settled = true; clearTimeout(timer); resolve(result); } };
        const timer = setTimeout(() => finish(false), 1500);
        try {
          const tx = db.transaction(STORE, 'readonly');
          const request = tx.objectStore(STORE).get(KEY);
          request.onsuccess = () => { value = request.result; };
          request.onerror = () => finish(false);
          tx.onabort = tx.onerror = () => finish(false);
          tx.oncomplete = () => {
            const record = value?.games?.find(g => g && String(g.id) === String(expected.id) && !g.deletedAt);
            const fields = ['title','platform','status','releaseYear','genre','franchise','rating','notes'];
            finish(!!record && fields.every(key => String(record[key] ?? '') === String(expected[key] ?? ''))
              && Number(record.replay || 0) === Number(expected.replay || 0)
              && (!expected.coverUrl || record.coverUrl === expected.coverUrl));
          };
        } catch (_) { finish(false); }
      });
    } catch (_) { return false; }
    finally { try { db?.close(); } catch (_) {} }
  }

  function wrapSave(base, mode) {
    return async function(event, ...args) {
      const form = event?.currentTarget;
      if (!(form instanceof HTMLFormElement)) return base.call(this, event, ...args);
      if (savingForms.has(form)) { event.preventDefault(); return; }
      const id = state.modal?.game?.id || '';
      const ids = new Set((state.games || []).map(g => String(g.id)));
      const title = String(new FormData(form).get('title') || '').trim();
      const buttons = [...form.querySelectorAll('[type="submit"]')].map(button => [button, button.disabled]);
      const token = ++sequence;
      savingForms.add(form); buttons.forEach(([button]) => { button.disabled = true; });
      try {
        const result = await base.call(this, event, ...args);
        // A handler that leaves its form open did not complete a save.
        if (form.isConnected || token !== sequence) return result;
        const game = id ? state.games.find(g => String(g.id) === String(id) && !g.deletedAt)
          : state.games.find(g => !ids.has(String(g.id)) && g.title === title && !g.deletedAt && (mode !== 'playing' || g.status === 'playing'));
        if (!game) return result;
        const expected = { ...game }, source = state.toast, generation = toastGeneration;
        const expectedToast = mode === 'playing'
          ? /^(Добавлено в «Сейчас играю»|Added to.*playing)$/i
          : /^(Сохранено|Saved)$/i;
        if (!expectedToast.test(String(source || ''))) return result;
        const confirmed = await storedMatch(expected);
        if (token !== sequence || state.toast !== source || generation !== toastGeneration || !source) return result;
        feedback = { sequence: token, source, generation, confirmed, expires: Date.now() + 2200 };
        if (confirmed) highlight = { id: String(game.id), used: false, expires: Date.now() + 4500 };
        schedule();
        return result;
      } finally {
        savingForms.delete(form);
        buttons.forEach(([button, disabled]) => { if (button.isConnected) button.disabled = disabled; });
      }
    };
  }
  // A later notification, even with the same text, is not this game's confirmation.
  if (typeof setToast === 'function') {
    const base = setToast;
    setToast = function(...args) { toastGeneration++; return base.apply(this, args); };
  }
  // Keep the existing form/save/rotation logic and return/error behavior.
  if (typeof saveGame === 'function') saveGame = wrapSave(saveGame, 'game');
  if (typeof savePlaying === 'function') savePlaying = wrapSave(savePlaying, 'playing');
  document.addEventListener('mc:experience-ready', schedule);
  window.addEventListener('pageshow', schedule);
  schedule();
})();
