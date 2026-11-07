/* Memory Card v78: quiet, optional shortcuts for long lists and game titles.
   No data writes, app render wrapper, polling or external dependencies. */
(() => {
  'use strict';
  const LIST_VIEWS = new Set(['games', 'backlog', 'timeline', 'collections', 'stats']);
  const tr = (ru, en) => state?.settings?.language === 'en' ? en : ru;
  const glyph = (paths) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + paths + '</svg>';

  let topButton = null;
  let frame = 0;

  function ensureTopButton() {
    if (topButton?.isConnected) return topButton;
    topButton = document.createElement('button');
    topButton.type = 'button';
    topButton.className = 'mc-quick-top';
    topButton.dataset.mcQuickTop = '1';
    topButton.hidden = true;
    topButton.innerHTML = glyph('<path d="M12 19V5m-6 6 6-6 6 6"/>') + '<span></span>';
    topButton.addEventListener('click', () => {
      if (topButton.hidden) return;
      const heading = document.querySelector('.content > .section-head h2, .content h2, .topbar .brand h1');
      if (heading) {
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
      const reduced = !!state?.settings?.reducedMotion ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, left: 0, behavior: reduced ? 'auto' : 'smooth' });
      schedule();
    });
    document.body.appendChild(topButton);
    return topButton;
  }

  function isTyping() {
    const active = document.activeElement;
    return !!active && (active.matches?.('input, textarea, select, [contenteditable="true"]') || active.isContentEditable);
  }

  function hasOverlay() {
    return !!document.querySelector('.modal-backdrop, dialog[open], .mc-cover-picker-backdrop, .mc-more-sheet[open], .mc-more-sheet.open');
  }

  function update() {
    frame = 0;
    const b = ensureTopButton();
    const eligible = typeof state !== 'undefined' &&
      LIST_VIEWS.has(state.view) && !state.modal && !hasOverlay() && !isTyping();
    const height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    const scroll = Math.max(window.scrollY, document.documentElement.scrollTop);
    const viewport = window.visualViewport?.height || window.innerHeight;
    const keyboardVisible = !!window.visualViewport && viewport < window.innerHeight * .72;
    b.hidden = !eligible || keyboardVisible ||
      height < window.innerHeight * 2.2 ||
      scroll < Math.max(640, window.innerHeight * 1.25);
    if (!b.hidden) {
      const text = tr('Наверх', 'To top');
      const label = tr('Вернуться к началу страницы', 'Back to top');
      if (b.querySelector('span')?.textContent !== text) b.querySelector('span').textContent = text;
      if (b.getAttribute('aria-label') !== label) b.setAttribute('aria-label', label);
    }
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  function addCopyAction() {
    if (typeof state === 'undefined' || state.view !== 'gameDetail') return;
    const root = document.querySelector('.v16-detail-actions');
    const gameId = String(state.gameDetailId || '');
    if (!root || !gameId || root.querySelector('[data-mc-copy-title]')) return;
    const game = (state.games || []).find(g => String(g.id) === gameId && !g.deletedAt);
    if (!game?.title) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'secondary mc-copy-title';
    btn.dataset.mcCopyTitle = gameId;
    btn.innerHTML = glyph('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>') + '<span></span>';
    btn.querySelector('span').textContent = tr('Скопировать название', 'Copy title');
    btn.setAttribute('aria-label', tr('Скопировать название игры', 'Copy game title') + ': ' + game.title);
    root.appendChild(btn);
  }

  function enhance() {
    schedule();
    addCopyAction();
  }

  async function copy(text) {
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(text); return true; } catch (_) {}
    }
    const node = document.createElement('textarea');
    const previous = document.activeElement;
    node.value = text;
    node.readOnly = true;
    node.setAttribute('aria-hidden', 'true');
    node.tabIndex = -1;
    node.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
    document.body.appendChild(node);
    let ok = false;
    try { node.select(); ok = !!document.execCommand('copy'); }
    catch (_) {}
    finally {
      node.remove();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    }
    return ok;
  }

  document.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest('[data-mc-copy-title]') : null;
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const id = String(button.dataset.mcCopyTitle || '');
    const game = (state.games || []).find(g => String(g.id) === id && !g.deletedAt);
    if (!game || state.view !== 'gameDetail' || String(state.gameDetailId) !== id) return;
    const title = String(game.title || '').trim();
    if (!title) return;
    button.disabled = true;
    copy(title).then(ok => {
      if (ok) {
        if (typeof setToast === 'function') setToast(tr('Название скопировано', 'Title copied'));
      } else {
        window.prompt(tr('Скопируй название вручную:', 'Copy the title manually:'), title);
      }
    }).finally(() => { if (button.isConnected) button.disabled = false; });
  }, true);

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.visualViewport?.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('pageshow', enhance);
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', schedule);
  document.addEventListener('mc:experience-ready', enhance);
  requestAnimationFrame(enhance);
})();
