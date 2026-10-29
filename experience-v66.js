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

  function enhance() {
    const app = document.querySelector('#app');
    if (!app) return;
    enhanceArt(app);
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
