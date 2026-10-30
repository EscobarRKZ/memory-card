/* v66: artwork states, a shared SVG vocabulary and readable card summaries.
   No game data, save handlers or authentication are changed here. */
(() => {
  'use strict';
  const paths = Object.freeze({
    edit: '<path d="m16 3 5 5M4 20l4-1L21 6l-4-4L4 15z"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-2l2 3M4 16l2 3a7 7 0 0 0 12-2"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    share: '<path d="M12 16V3m-4 4 4-4 4 4M5 12v8h14v-8"/>',
    download: '<path d="M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5"/>',
    note: '<path d="M5 3h14v18H5zM8 8h8M8 12h8M8 16h5"/>',
    check: '<path d="m5 12 4 4L19 6"/>'
  });
  const tr = (ru, en) => state?.settings?.language === 'en' ? en : ru;
  const icon = name => `<svg class="mc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.note}</svg>`;
  const artworkSelector = '.cover,.detail-cover,.mini-cover,.playing-cover,.v16-detail-cover,.v16-hero-art,.v16-backlog-cover';
  const reduced = () => !!state?.settings?.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;

  function settle(image, ok) {
    const art = image.parentElement;
    if (!art?.classList.contains('mc-art')) return;
    art.classList.remove('mc-art-pending');
    art.classList.toggle('mc-art-ready', ok);
    art.classList.toggle('image-failed', !ok);
    const retry = art.querySelector('[data-mc-art-retry]');
    if (retry) retry.hidden = ok;
  }

  function retryMarkup() {
    return `<button type="button" class="mc-art-retry" data-mc-art-retry hidden aria-label="${tr('Загрузить обложку ещё раз','Retry cover loading')}" title="${tr('Повторить загрузку','Retry loading')}">${icon('refresh')}</button>`;
  }

  const baseCover = coverMarkup;
  coverMarkup = function(game, cls = 'cover') {
    let html = baseCover.apply(this, arguments);
    if (!safeImage(game?.coverUrl)) return html;
    html = html.replace(/^<div class="/, '<div class="mc-art mc-art-pending ')
      .replace(/\sonerror="[^"]*"/g, '')
      .replace('<img ', '<img data-mc-art-image ');
    // Small covers can be nested inside buttons; never insert a button in a button.
    if (!/(?:mini|playing)-cover/.test(cls)) html = html.replace(/<\/div>\s*$/, retryMarkup() + '</div>');
    return html;
  };

  function enhanceArt(root) {
    root.querySelectorAll(artworkSelector).forEach(art => {
      const image = art.querySelector('img');
      if (!image) return;
      if (!art.classList.contains('mc-art')) {
        art.classList.add('mc-art', 'mc-art-pending');
        image.dataset.mcArtImage = '';
        image.removeAttribute('onerror');
        if (!art.closest('button') && !art.matches('.mini-cover,.playing-cover') && !art.querySelector('[data-mc-art-retry]')) {
          art.insertAdjacentHTML('beforeend', retryMarkup());
        }
      }
      if (image.complete) settle(image, image.naturalWidth > 0);
    });
  }

  function decorate(button, name, fixedLabel = '') {
    if (button.querySelector(':scope > .mc-icon')) return;
    const label = fixedLabel || button.textContent.trim().replace(/^[↻✎✏️×]+\s*/u, '');
    button.classList.add('mc-icon-button');
    button.innerHTML = icon(name);
    if (label) {
      const text = document.createElement('span');
      text.textContent = label;
      button.appendChild(text);
    }
  }


  // v71: edit a rating in its own form, including finishRotationForm.
  // Only the hidden form field changes; saving/cancelling stays with the caller.
  const ratingSelector = '#gameForm .star-picker,#finishRotationForm .star-picker';
  function ratingPicker(node) {
    const picker = node?.closest('.star-picker');
    return picker?.matches(ratingSelector) ? picker : null;
  }
  function ratingValue(picker) {
    const n = Number(picker.querySelector('input[name="rating"]')?.value);
    return Number.isInteger(n) && n >= 1 && n <= 10 ? n : 0;
  }
  function paintRating(picker, preview = 0) {
    const current = ratingValue(picker);
    picker.classList.toggle('mc-rating-preview', preview > 0);
    picker.setAttribute('aria-label', tr('Моя оценка от 1 до 10','My rating from 1 to 10'));
    picker.querySelectorAll('button[data-rating]').forEach(button => {
      const n = Number(button.dataset.rating);
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(n === current));
      button.setAttribute('aria-label', tr(`${n} из 10`, `${n} out of 10`));
      button.tabIndex = n === (current || 1) ? 0 : -1;
      button.classList.toggle('selected', n <= current);
      button.classList.toggle('mc-rating-previewed', preview > 0 && n <= preview);
    });
    const footer = picker.nextElementSibling;
    if (!footer?.classList.contains('mc-rating-controls')) return;
    const label = footer.querySelector('.star-value');
    const value = preview || current;
    const text = value ? `${value}/10` : tr('Без оценки','Not rated');
    if (label && label.textContent !== text) label.textContent = text;
    const reset = footer.querySelector('[data-mc-rating-clear]');
    if (reset) {
      reset.textContent = tr('Снять оценку','Clear rating');
      // Keep the button focusable after clearing; no loss of keyboard focus.
      reset.setAttribute('aria-disabled', String(!current));
    }
  }
  function enhanceRatings(app) {
    app.querySelectorAll(ratingSelector).forEach(picker => {
      if (!picker.querySelector('input[name="rating"]')) return;
      let footer = picker.nextElementSibling;
      if (!footer?.classList.contains('mc-rating-controls')) {
        footer = document.createElement('div');
        footer.className = 'mc-rating-controls';
        const label = picker.querySelector('.star-value') || document.createElement('span');
        label.classList.add('star-value');
        const reset = document.createElement('button');
        reset.type = 'button';
        reset.className = 'mc-rating-clear';
        reset.dataset.mcRatingClear = '';
        footer.append(label, reset);
        picker.insertAdjacentElement('afterend', footer);
      }
      picker.classList.add('mc-rating-enhanced');
      paintRating(picker);
    });
  }
  function changeRating(picker, value) {
    const input = picker?.querySelector('input[name="rating"]');
    if (!input || input.disabled || picker.closest('fieldset[disabled]')) return;
    const next = value >= 1 && value <= 10 ? String(value) : '';
    const changed = input.value !== next;
    input.value = next;
    paintRating(picker);
    // Existing draft capture and update guards receive the real input change.
    if (changed) {
      input.dispatchEvent(new Event('input', {bubbles:true}));
      input.dispatchEvent(new Event('change', {bubbles:true}));
    }
  }
  // The '+' on a platform-filtered library should use that platform, not the
  // unrelated current rotation. Explicit prefill always wins. No stored defaults.
  if (typeof openAddCompleted === 'function') {
    const baseAdd = openAddCompleted;
    openAddCompleted = function(prefill = {}) {
      const id = state.view === 'games' ? state.platformFilter : '';
      if (id && PLATFORMS.some(p => p.id === id) && prefill && typeof prefill === 'object'
          && !Object.prototype.hasOwnProperty.call(prefill, 'platform')) {
        return baseAdd.call(this, {...prefill, platform:id});
      }
      return baseAdd.apply(this, arguments);
    };
  }

  // v75: a comfortable writing area, still the same native form field.
  const notesSelector = '#gameForm textarea[name="notes"],#finishRotationForm textarea[name="notes"]';
  const noteSizes = new WeakMap();
  const expandedNotes = new WeakSet();
  let notesFrame = 0, noteId = 0;

  function measuredNoteHeight(input, styles) {
    // Measuring an off-flow copy avoids collapsing the live textarea and
    // clamping its scroll container while the user is writing near the bottom.
    const mirror = document.createElement('textarea');
    mirror.tabIndex = -1;
    mirror.setAttribute('aria-hidden', 'true');
    mirror.readOnly = true;
    mirror.wrap = input.wrap;
    mirror.style.cssText = 'position:fixed;left:-10000px;top:0;height:0;min-height:0;max-height:none;visibility:hidden;pointer-events:none;overflow:hidden;resize:none;margin:0;';
    for (const key of ['boxSizing','fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing','textIndent','textTransform','tabSize','whiteSpace','wordBreak','overflowWrap','direction','paddingTop','paddingBottom','paddingLeft','paddingRight','borderTopWidth','borderBottomWidth','borderLeftWidth','borderRightWidth','borderStyle']) {
      mirror.style[key] = styles[key];
    }
    mirror.style.width = `${input.getBoundingClientRect().width}px`;
    mirror.value = input.value;
    document.body.appendChild(mirror);
    try { return mirror.scrollHeight + parseFloat(styles.borderTopWidth || 0) + parseFloat(styles.borderBottomWidth || 0); }
    finally { mirror.value = ''; mirror.remove(); }
  }

  function updateNotes(input) {
    if (!input.isConnected || !input.getClientRects().length) return;
    const expanded = expandedNotes.has(input);
    const footer = input.nextElementSibling;
    if (!footer?.classList.contains('mc-note-tools')) return;
    const length = Array.from(input.value).length;
    const counter = footer.querySelector('[data-mc-note-count]');
    const text = length ? tr(`Знаков: ${length.toLocaleString('ru-RU')}`, `Characters: ${length.toLocaleString('en-US')}`)
      : tr('Можно оставить пустым', 'Optional');
    if (counter.textContent !== text) counter.textContent = text;
    const button = footer.querySelector('[data-mc-note-expand]');
    const label = expanded ? tr('Компактно', 'Compact') : tr('Больше места', 'More space');
    if (button.textContent !== label) button.textContent = label;
    button.setAttribute('aria-expanded', String(expanded));
    button.disabled = input.matches(':disabled');
    const viewport = window.visualViewport?.height || innerHeight;
    const min = 112;
    const cap = Math.max(min, Math.floor(Math.min(expanded ? 560 : 300, viewport * (expanded ? .62 : .36))));
    const width = input.getBoundingClientRect().width;
    const styles = getComputedStyle(input);
    const signature = [input.value, width, cap, expanded, styles.font, styles.lineHeight, styles.letterSpacing].join('\u0000');
    if (noteSizes.get(input) === signature) return;
    const natural = measuredNoteHeight(input, styles);
    const height = expanded ? cap : Math.max(min, Math.min(cap, natural));
    const overflow = natural > height + 1 ? 'auto' : 'hidden';
    if (input.style.height !== `${height}px`) input.style.height = `${height}px`;
    if (input.style.overflowY !== overflow) input.style.overflowY = overflow;
    noteSizes.set(input, signature);
  }

  function enhanceNotes(app) {
    app.querySelectorAll(notesSelector).forEach(input => {
      input.classList.add('mc-note-input');
      if (!input.id) input.id = `mc-personal-note-${++noteId}`;
      const label = input.closest('.field')?.querySelector('label');
      if (label && !label.htmlFor) label.htmlFor = input.id;
      let footer = input.nextElementSibling;
      if (!footer?.classList.contains('mc-note-tools')) {
        footer = document.createElement('div');
        footer.className = 'mc-note-tools';
        const counter = document.createElement('small');
        counter.dataset.mcNoteCount = '';
        counter.id = `${input.id}-count`;
        // Not a live region: do not announce every keystroke.
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mc-note-expand';
        button.dataset.mcNoteExpand = '';
        button.setAttribute('aria-controls', input.id);
        footer.append(counter, button);
        input.insertAdjacentElement('afterend', footer);
        const described = new Set((input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
        described.add(counter.id);
        input.setAttribute('aria-describedby', [...described].join(' '));
      }
      updateNotes(input);
    });
  }
  function scheduleNotes() {
    if (notesFrame || !document.querySelector(notesSelector)) return;
    notesFrame = requestAnimationFrame(() => {
      notesFrame = 0;
      document.querySelectorAll(notesSelector).forEach(updateNotes);
    });
  }
  document.addEventListener('input', event => {
    if (event.target instanceof HTMLTextAreaElement && event.target.matches(notesSelector)) scheduleNotes();
  });
  document.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest('[data-mc-note-expand]') : null;
    if (!button || button.disabled) return;
    const input = button.parentElement?.previousElementSibling;
    if (!(input instanceof HTMLTextAreaElement) || !input.matches(notesSelector) || input.matches(':disabled')) return;
    event.preventDefault();
    expandedNotes.has(input) ? expandedNotes.delete(input) : expandedNotes.add(input);
    updateNotes(input);
  }, true);
  // Fields are restored by the existing draft helper before this queued read.
  document.addEventListener('reset', event => {
    if (event.target instanceof HTMLFormElement && event.target.querySelector(notesSelector)) scheduleNotes();
  });
  window.addEventListener('resize', scheduleNotes, {passive: true});
  window.visualViewport?.addEventListener('resize', scheduleNotes, {passive: true});

  function enhance() {
    const app = document.querySelector('#app');
    if (!app) return;
    enhanceArt(app);
    enhanceRatings(app);
    enhanceNotes(app);
    app.querySelectorAll('.topbar [data-action="add"]').forEach(button => {
      const id = state.view === 'games' ? state.platformFilter : '';
      const p = typeof PLATFORMS !== 'undefined' ? PLATFORMS.find(p => p.id === id) : null;
      const text = p ? tr(`Добавить пройденную игру для ${p.name}`, `Add a completed game for ${p.name}`)
        : tr('Добавить пройденную игру', 'Add a completed game');
      button.setAttribute('aria-label', text);
      button.title = text;
    });
    const controls = [
      ['[data-action="edit"],[data-mc-card-edit]', 'edit'],
      ['[data-v17-cover-refresh],[data-action="covers-refresh"]', 'refresh'],
      ['[data-mc-filters]', 'filter']
    ];
    controls.forEach(([selector, name]) => app.querySelectorAll(selector).forEach(button => decorate(button, name)));
    app.querySelectorAll('.icon-btn[data-action="close"],[data-mc-clear-search]').forEach(button => {
      if (!button.getAttribute('aria-label')) button.setAttribute('aria-label', tr('Закрыть','Close'));
      decorate(button, 'close', '');
    });
    app.querySelectorAll('.mc-search-field').forEach(field => {
      if (field.querySelector('.mc-search-symbol')) return;
      const mark = document.createElement('span');
      mark.className = 'mc-search-symbol';
      mark.innerHTML = icon('search');
      field.appendChild(mark);
    });
    app.querySelectorAll('.game-card .game-body h3').forEach(title => {
      if (!title.title) title.title = title.textContent;
    });
    app.querySelectorAll('.v14-list-notes:not(.is-empty)').forEach(note => {
      const card = note.closest('.game-card');
      if (!card || card.querySelector('[data-mc-read-note]') || note.scrollHeight <= note.clientHeight + 2) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mc-read-note mc-icon-button';
      button.dataset.mcReadNote = card.dataset.game || '';
      button.innerHTML = icon('note');
      const label = document.createElement('span');
      label.textContent = tr('Читать запись', 'Read entry');
      button.appendChild(label);
      note.insertAdjacentElement('afterend', button);
    });
    document.dispatchEvent(new Event('mc:experience-ready'));
  }

  let frame = 0;
  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; enhance(); });
  }
  const baseRender = render;
  render = function(...args) {
    const value = baseRender.apply(this, args);
    schedule();
    return value;
  };
  document.addEventListener('load', event => {
    if (event.target instanceof HTMLImageElement && event.target.hasAttribute('data-mc-art-image')) settle(event.target, true);
  }, true);
  document.addEventListener('error', event => {
    if (event.target instanceof HTMLImageElement && event.target.hasAttribute('data-mc-art-image')) settle(event.target, false);
  }, true);
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    const star = target?.closest('button[data-rating]');
    const picker = star && ratingPicker(star);
    const clear = target?.closest('[data-mc-rating-clear]');
    const clearPicker = clear?.parentElement?.previousElementSibling;
    if (picker || (clear && clearPicker?.matches(ratingSelector))) {
      event.preventDefault();
      // The old handler always queried #gameForm, even in the rotation form.
      event.stopImmediatePropagation();
      if (star?.disabled || clear?.disabled) return;
      changeRating(picker || clearPicker, picker ? Number(star.dataset.rating) : 0);
      return;
    }
    const retry = target?.closest('[data-mc-art-retry]');
    if (retry) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const art = retry.closest('.mc-art');
      const image = art?.querySelector('img');
      if (!image) return;
      try {
        const url = new URL(image.src);
        // Signed image URLs must not be modified. Other URLs can bypass a failed image cache.
        if (!/signature|token|x-amz-/i.test(url.search)) url.searchParams.set('mc_retry', String(Date.now()));
        retry.hidden = true;
        art.classList.remove('image-failed', 'mc-art-ready');
        art.classList.add('mc-art-pending');
        image.src = url.href;
      } catch (_) { settle(image, false); }
      return;
    }
    const note = target?.closest('[data-mc-read-note]');
    if (note) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openGame(note.dataset.mcReadNote);
      requestAnimationFrame(() => document.querySelector('.v16-notes')?.scrollIntoView({block:'center',behavior: reduced() ? 'auto' : 'smooth'}));
    }
  }, true);
  document.addEventListener('keydown', event => {
    const star = event.target instanceof Element ? event.target.closest('button[data-rating]') : null;
    const picker = star && ratingPicker(star);
    if (!picker || star.disabled || picker.closest('fieldset[disabled]') || event.isComposing
        || event.altKey || event.metaKey || event.ctrlKey) return;
    const keys = ['ArrowRight','ArrowUp','ArrowLeft','ArrowDown','Home','End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const n = Number(star.dataset.rating);
    const next = event.key === 'Home' ? 1 : event.key === 'End' ? 10
      : (n + (['ArrowRight','ArrowUp'].includes(event.key) ? 1 : 9) - 1) % 10 + 1;
    const button = picker.querySelector(`[data-rating="${next}"]`);
    if (!button || button.disabled) return;
    changeRating(picker, next);
    button.focus({preventScroll:true});
  });
  document.addEventListener('pointerover', event => {
    if (event.pointerType !== 'mouse') return;
    const star = event.target instanceof Element ? event.target.closest('button[data-rating]') : null;
    const picker = star && ratingPicker(star);
    if (picker && !star.disabled && !picker.closest('fieldset[disabled]')) paintRating(picker, Number(star.dataset.rating));
  });
  document.addEventListener('pointerout', event => {
    const picker = event.target instanceof Element ? ratingPicker(event.target) : null;
    if (picker && (!(event.relatedTarget instanceof Node) || !picker.contains(event.relatedTarget))) paintRating(picker);
  });
  document.addEventListener('change', event => {
    if (event.target?.id === 'gamesView') schedule();
  });
  window.addEventListener('pageshow', schedule);
  const root = document.querySelector('#app');
  // Some legacy cloud callbacks call an older render reference directly.
  // Watch only root replacement, not every subtree mutation.
  if (root) new MutationObserver(schedule).observe(root, {childList:true});
  window.MemoryCardExperience = Object.freeze({icon, tr, enhance: schedule});
  schedule();
})();
