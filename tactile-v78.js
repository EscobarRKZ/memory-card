/* v78: tactile layer. Haptics, press feedback, star dragging, sheet swipes, sliding nav pill,
   section transitions, LED toast and hero parallax.
   Additive only: delegated listeners plus one observer on #app. It never writes app state,
   storage keys other than its own haptics switch, or cloud data. */
(() => {
  'use strict';
  if (window.MemoryCardTactile) return;
  const root = document.querySelector('#app');
  if (!root) return;

  const tr = (ru, en) => { try { return state?.settings?.language === 'en' ? en : ru; } catch (_) { return ru; } };
  const reduced = () => {
    try { if (state?.settings?.reducedMotion) return true; } catch (_) {}
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  };
  const closestOf = (event, selector) => (event.target instanceof Element ? event.target.closest(selector) : null);

  /* ---------- Haptics ---------- */
  // Vibration is a per-device taste, so the switch lives in localStorage, not in synced settings.
  const KEY = 'memory-card-haptics-v1';
  const pref = {
    on() { try { return localStorage.getItem(KEY) !== 'off'; } catch (_) { return true; } },
    set(value) { try { localStorage.setItem(KEY, value ? 'on' : 'off'); } catch (_) {} }
  };
  const supported = typeof navigator.vibrate === 'function';
  const PATTERNS = {
    soft: 5, select: 6, tick: 8, press: 10, threshold: 10,
    warn: [18, 45, 18], success: [10, 40, 16], done: [12, 35, 12, 35, 28]
  };
  let lastBuzz = 0;
  function buzz(name) {
    if (!supported || !pref.on() || reduced() || document.hidden) return false;
    const now = performance.now();
    if (now - lastBuzz < 35) return false;
    lastBuzz = now;
    try { return navigator.vibrate(PATTERNS[name] || PATTERNS.tick); } catch (_) { return false; }
  }

  // Taps only (click), never pointerdown: a scroll that starts on a card must stay silent.
  window.addEventListener('click', event => {
    if (!event.isTrusted) return;
    if (closestOf(event, 'button[data-rating]')) return; // stars have their own pattern
    if (closestOf(event, '.mobile-nav button, .nav button, .mc-mobile-subnav button, [data-mobile-more-nav]')) return void buzz('tick');
    if (closestOf(event, '.danger')) return void buzz('warn');
    if (closestOf(event, '.primary')) return void buzz('press');
    if (closestOf(event, '.game-card, .platform-card, .v16-backlog-card, .v16-collection-card, .secondary, .ghost, .icon-btn, .mc-card-edit, .mc-status-pill, .mc-filter-toggle')) buzz('soft');
  }, true);

  /* ---------- Press feedback ---------- */
  // :active is unreliable on non-interactive elements in iOS Safari, so a class mirrors it.
  const PRESS = '.game-card, .platform-card, .v16-backlog-card, .v16-collection-card, .platform-choice-button, '
    + '.mc-mobile-nav-item, .mc-more-list > button, .mc-more-head > button, .primary, .secondary, .ghost, .danger, .mc-card-edit';
  let press = null;
  function releasePress(cancelled) {
    const rec = press;
    if (!rec) return;
    press = null;
    clearTimeout(rec.timer);
    if (cancelled) { rec.el.classList.remove('mc-pressed'); return; }
    // A very quick tap still shows its squeeze for a beat.
    if (!rec.on) rec.el.classList.add('mc-pressed');
    const hold = rec.on ? Math.max(0, 90 - (performance.now() - rec.at)) : 110;
    setTimeout(() => rec.el.classList.remove('mc-pressed'), hold);
  }
  document.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const el = closestOf(event, PRESS);
    if (!el || el.disabled) return;
    releasePress(true);
    const rec = { el, timer: 0, on: false, at: 0 };
    const apply = () => { rec.on = true; rec.at = performance.now(); el.classList.add('mc-pressed'); };
    // Touch waits briefly so the start of a scroll does not flash a squeeze.
    if (event.pointerType === 'mouse') apply(); else rec.timer = setTimeout(apply, 55);
    press = rec;
  }, { capture: true, passive: true });
  document.addEventListener('pointerup', () => releasePress(false), true);
  document.addEventListener('pointercancel', () => releasePress(true), true);
  document.addEventListener('contextmenu', () => releasePress(true), true);

  /* ---------- Stars: pop and drag ---------- */
  const RATING = '#gameForm .star-picker, #finishRotationForm .star-picker';
  const ratingPicker = node => { const p = node?.closest('.star-picker'); return p?.matches(RATING) ? p : null; };
  function pop(el) {
    if (reduced()) return;
    el.classList.remove('mc-star-pop');
    void el.offsetWidth;
    el.classList.add('mc-star-pop');
    el.addEventListener('animationend', () => el.classList.remove('mc-star-pop'), { once: true });
  }
  let driving = false, dragSuppress = false, ratingDrag = null;
  window.addEventListener('click', event => {
    const star = closestOf(event, 'button[data-rating]');
    if (!star || driving || !ratingPicker(star)) return;
    // The click that ends a drag must not reset the rating back to the star it started on.
    if (dragSuppress) { event.preventDefault(); event.stopPropagation(); dragSuppress = false; return; }
    pop(star);
    buzz(Number(star.dataset.rating) === 10 ? 'done' : 'select');
  }, true);
  document.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const star = closestOf(event, 'button[data-rating]');
    const picker = star && ratingPicker(star);
    if (!picker || star.disabled) return;
    dragSuppress = false;
    ratingDrag = { picker, id: event.pointerId, x: event.clientX, last: Number(star.dataset.rating), moved: false };
  }, true);
  document.addEventListener('pointermove', event => {
    const drag = ratingDrag;
    if (!drag || event.pointerId !== drag.id) return;
    if (event.pointerType === 'mouse' && event.buttons !== 1) { ratingDrag = null; return; }
    if (!drag.moved && Math.abs(event.clientX - drag.x) < 6) return;
    drag.moved = true;
    const star = document.elementFromPoint(event.clientX, event.clientY)?.closest('button[data-rating]');
    if (!star || !drag.picker.contains(star) || star.disabled) return;
    const n = Number(star.dataset.rating);
    if (n === drag.last) return;
    drag.last = n;
    dragSuppress = true;
    drag.picker.classList.add('mc-dragging');
    driving = true;
    try { star.click(); } finally { driving = false; } // reuses the existing rating handler
    pop(star);
    buzz(n === 10 ? 'done' : 'select');
  }, true);
  const endRatingDrag = () => {
    ratingDrag?.picker.classList.remove('mc-dragging');
    ratingDrag = null;
    setTimeout(() => { dragSuppress = false; }, 350);
  };
  document.addEventListener('pointerup', endRatingDrag, true);
  document.addEventListener('pointercancel', endRatingDrag, true);

  /* ---------- Sheets: swipe down to dismiss ---------- */
  const SHEETS = [
    { panel: '.mc-more-panel', grab: '.mc-more-handle, .mc-more-head', close: '[data-mobile-more-close]', fade: '#mc-more-sheet', mq: '(max-width: 900px)' },
    { panel: '#app .modal', grab: '.modal-head, .game-detail-hero', close: '[data-action="close"]', fade: '.modal-backdrop', mq: '(max-width: 600px)', backdrop: true },
    { panel: '.mc-share-dialog', grab: '.mc-share-head', close: '[data-share-close]', fade: '.mc-share-dialog', mq: '(max-width: 600px)' }
  ];
  const SPRING = 'transform .42s cubic-bezier(.34, 1.56, .64, 1)';
  let sheet = null, swallowAt = 0, closing = false;
  document.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse') return; // touch and pen only: mouse keeps text selection
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    for (const cfg of SHEETS) {
      if (!matchMedia(cfg.mq).matches) continue;
      const grab = target.closest(cfg.grab);
      const panel = grab && grab.closest(cfg.panel);
      if (!panel) continue;
      sheet = {
        cfg, panel, id: event.pointerId, x: event.clientX, y: event.clientY, active: false, off: 0, crossed: false,
        h: panel.getBoundingClientRect().height, fade: panel.closest(cfg.fade) || panel, samples: [[performance.now(), event.clientY]]
      };
      return;
    }
  }, true);
  document.addEventListener('pointermove', event => {
    const s = sheet;
    if (!s || event.pointerId !== s.id) return;
    const dy = event.clientY - s.y, dx = event.clientX - s.x;
    if (!s.active) {
      if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return;
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) { sheet = null; return; } // only a downward pull is ours
      s.active = true;
      s.panel.style.transition = 'none';
      s.panel.classList.add('mc-sheet-dragging');
    }
    // 1:1 downward, rubber band if the finger comes back above where it started.
    s.off = dy >= 0 ? dy : -Math.pow(-dy, .6);
    s.panel.style.transform = `translate3d(0, ${s.off}px, 0)`;
    s.fade.style.setProperty('--mc-drag-fade', String(Math.max(0, 1 - Math.max(0, s.off) / (s.h * .85))));
    s.samples.push([performance.now(), event.clientY]);
    if (s.samples.length > 4) s.samples.shift();
    const crossed = s.off > Math.min(140, s.h * .3);
    if (crossed !== s.crossed) { s.crossed = crossed; buzz('threshold'); }
  }, true);
  function settle(s) {
    s.panel.style.transition = SPRING;
    s.panel.style.transform = '';
    s.fade.style.removeProperty('--mc-drag-fade');
    setTimeout(() => {
      s.panel.style.transition = '';
      s.panel.style.willChange = '';
      s.panel.classList.remove('mc-sheet-dragging');
    }, 460);
  }
  function dismiss(s) {
    const button = s.panel.querySelector(s.cfg.close);
    closing = true;
    try {
      if (button) button.click();
      else if (s.cfg.backdrop) s.panel.closest('.modal-backdrop')?.click();
    } finally { closing = false; }
    // The owner may refuse (unsaved draft prompt). If the panel is still there, spring back.
    requestAnimationFrame(() => settle(s));
  }
  function endSheet(event, cancelled) {
    const s = sheet;
    if (!s || event.pointerId !== s.id) return;
    sheet = null;
    if (!s.active) return;
    swallowAt = performance.now();
    const first = s.samples[0], last = s.samples[s.samples.length - 1];
    const velocity = last[0] > first[0] ? (last[1] - first[1]) / (last[0] - first[0]) : 0; // px per ms
    const far = s.off > Math.min(140, s.h * .3);
    if (!cancelled && (far || (velocity > .6 && s.off > 30))) {
      s.panel.style.transition = 'transform .22s cubic-bezier(.4, 0, 1, 1)';
      s.panel.style.transform = `translate3d(0, ${s.h + 40}px, 0)`;
      s.fade.style.setProperty('--mc-drag-fade', '0');
      setTimeout(() => dismiss(s), 200);
    } else settle(s);
  }
  document.addEventListener('pointerup', event => endSheet(event, false), true);
  document.addEventListener('pointercancel', event => endSheet(event, true), true);
  // A finished swipe often ends in a synthetic click on the handle or close button: swallow it.
  window.addEventListener('click', event => {
    if (closing || !event.isTrusted || performance.now() - swallowAt > 400) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  /* ---------- Section changes via View Transitions ---------- */
  let replaying = false;
  window.addEventListener('click', event => {
    if (replaying || !event.isTrusted || event.defaultPrevented || event.button
      || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (typeof document.startViewTransition !== 'function' || reduced()) return;
    const button = closestOf(event, '[data-nav]');
    if (!button) return;
    let current;
    try { current = state.view; } catch (_) { return; }
    const view = button.dataset.nav;
    if (!view || view === current || document.querySelector('dialog[open], .modal-backdrop')) return;
    event.stopImmediatePropagation();
    event.preventDefault();
    // Everything the click does (navigate + render) runs inside the callback, so any code that
    // expects the new DOM right after render() still sees it.
    const run = () => {
      replaying = true;
      try {
        if (button.isConnected) button.click();
        else if (typeof navigate === 'function') navigate(view);
      } finally { replaying = false; }
    };
    try {
      const transition = document.startViewTransition(run);
      transition.ready?.catch(() => {});
      transition.finished?.catch(() => {});
    } catch (_) { run(); }
  }, true);

  /* ---------- Per-render enhancements ---------- */
  let navMemo = null, lastRender = performance.now(), modalSeen = false;
  let lastToast = null, lastToastKey = '', lastToastAt = 0, lastSeq = '';
  let frame = 0;

  function enhanceNav() {
    const nav = root.querySelector('.mobile-nav');
    const active = nav?.querySelector('.mc-mobile-nav-item.active');
    nav?.querySelector(':scope > .mc-nav-pill')?.remove();
    if (!nav || !active || !nav.offsetWidth) { navMemo = null; return; }
    const pill = document.createElement('span');
    pill.className = 'mc-nav-pill';
    pill.setAttribute('aria-hidden', 'true');
    nav.prepend(pill);
    const x = active.offsetLeft;
    pill.style.width = `${active.offsetWidth}px`;
    pill.style.height = `${active.offsetHeight}px`;
    pill.style.top = `${active.offsetTop}px`;
    const move = navMemo && Math.abs(navMemo.x - x) > 1 && !reduced();
    if (move) {
      // FLIP: render() rebuilt the bar, so start where the pill was and let it slide.
      pill.style.transition = 'none';
      pill.style.transform = `translateX(${navMemo.x}px)`;
      void pill.offsetWidth;
      pill.style.transition = '';
      active.classList.add('mc-nav-pop');
      active.addEventListener('animationend', () => active.classList.remove('mc-nav-pop'), { once: true });
    }
    pill.style.transform = `translateX(${x}px)`;
    navMemo = { x };
  }

  function enhanceSettings() {
    const grid = root.querySelector('.appearance-extra-grid');
    if (!grid || grid.querySelector('#hapticsMode')) return;
    const label = document.createElement('label');
    label.className = 'appearance-toggle mc-haptics-toggle';
    const copy = document.createElement('span');
    const title = document.createElement('b');
    title.textContent = tr('Вибрация', 'Haptics');
    const note = document.createElement('small');
    note.className = 'status-line';
    note.textContent = supported
      ? tr('Лёгкий отклик на касания', 'Light feedback on touch')
      : tr('Недоступна в этом браузере (например, на iPhone)', 'Not available in this browser (for example on iPhone)');
    copy.append(title, note);
    const input = document.createElement('input');
    input.id = 'hapticsMode';
    input.type = 'checkbox';
    // defaultChecked matters: the update guard treats checked !== defaultChecked as an unsaved edit.
    input.defaultChecked = supported && pref.on();
    input.checked = input.defaultChecked;
    input.disabled = !supported;
    label.append(copy, input);
    grid.appendChild(label);
  }
  document.addEventListener('change', event => {
    if (event.target?.id !== 'hapticsMode') return;
    pref.set(event.target.checked);
    event.target.defaultChecked = event.target.checked; // a saved choice, not a pending edit
    if (event.target.checked) buzz('success');
  });

  const heroes = () => root.querySelectorAll('.v16-home-hero, .v16-detail');
  function parallax() {
    const still = reduced();
    heroes().forEach(el => {
      const top = el.getBoundingClientRect().top;
      const value = still ? 0 : Math.max(-28, Math.min(28, -top * .1));
      el.style.setProperty('--mc-py', value.toFixed(1));
    });
  }

  function enhance() {
    frame = 0;
    enhanceNav();
    enhanceSettings();
    parallax();
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(enhance); };

  // Runs as a microtask right after render(), before the first paint of the new DOM.
  function onRender() {
    lastRender = performance.now();
    const backdrop = root.querySelector(':scope > .modal-backdrop');
    if (backdrop && !modalSeen && !reduced()) backdrop.classList.add('mc-modal-enter');
    modalSeen = !!backdrop;
    const toast = root.querySelector(':scope > .toast');
    if (toast && toast !== lastToast) {
      lastToast = toast;
      let key = '';
      try { key = String(state.toast || ''); } catch (_) {}
      const now = performance.now();
      if (!reduced() && (key !== lastToastKey || now - lastToastAt > 5000)) toast.classList.add('mc-toast-enter');
      lastToastKey = key;
      lastToastAt = now;
    }
    schedule();
  }
  function onFeedback() {
    const toast = root.querySelector(':scope > .toast[data-mc-memory-feedback]');
    const seq = toast?.dataset.mcMemoryFeedback;
    if (!toast || !seq || seq === lastSeq) return;
    lastSeq = seq;
    if (!reduced()) toast.classList.add('mc-led-blink');
    buzz(toast.classList.contains('mc-memory-unconfirmed') ? 'warn' : 'success');
  }
  new MutationObserver(records => {
    let rendered = false, feedback = false;
    for (const record of records) {
      if (record.type === 'childList' && record.target === root) rendered = true;
      else if (record.type === 'attributes') feedback = true;
    }
    if (rendered) onRender();
    if (feedback || rendered) onFeedback();
  }).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-mc-memory-feedback'] });

  // A network image that lands late fades in; a cached one (load within ~140 ms of render) stays still.
  document.addEventListener('load', event => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement) || reduced()) return;
    const art = img.closest('.mc-art');
    if (!art || performance.now() - lastRender < 140) return;
    art.classList.add('mc-art-reveal');
    img.addEventListener('animationend', () => art.classList.remove('mc-art-reveal'), { once: true });
  }, true);

  let scrolling = 0;
  window.addEventListener('scroll', () => {
    if (!scrolling) scrolling = requestAnimationFrame(() => { scrolling = 0; parallax(); });
  }, { passive: true });
  window.addEventListener('resize', () => { navMemo = null; schedule(); });
  window.addEventListener('pageshow', schedule);

  window.MemoryCardTactile = Object.freeze({ buzz, supported, enabled: () => supported && pref.on() && !reduced() });
  onRender();
})();
