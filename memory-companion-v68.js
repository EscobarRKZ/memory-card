/* v68: a quiet decorative memory card for genuine empty lists.
   No game data, request, storage write, timer loop or application handler changes. */
(() => {
  'use strict';
  let frame = 0;
  const faces = Object.freeze({
    welcome: '<path d="M33 34v5m14-5v5M35 46q5 4 10 0"/>',
    sleepy: '<path d="M30 37q4 4 8 0m7 0q4 4 8 0M38 46q3-2 6 0"/>',
    search: '<circle cx="34" cy="36" r="2"/><circle cx="49" cy="36" r="2"/><path d="M38 46h6"/>',
    collection: '<path d="M30 38q4-6 8 0m7 0q4-6 8 0M35 46q6 6 12 0"/>'
  });
  const extras = Object.freeze({
    welcome: '<path class="mc-companion-line" d="M74 12v8m-4-4h8"/>',
    sleepy: '<path class="mc-companion-line" d="M72 13h8l-8 8h8m3 6h5l-5 5h5"/>',
    search: '<g class="mc-companion-loupe"><circle cx="67" cy="48" r="10"/><path d="m74 55 9 10"/></g>',
    collection: '<path class="mc-companion-line" d="m76 13 2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/>'
  });

  function markup(mood) {
    // Only internal constants enter the SVG. Application/user text stays untouched.
    return '<svg viewBox="0 0 96 82" aria-hidden="true" focusable="false">'
      + '<ellipse class="mc-companion-shadow" cx="43" cy="74" rx="26" ry="3"/>'
      + '<path class="mc-companion-shell" d="M24 8h30l12 12v44a5 5 0 0 1-5 5H24a5 5 0 0 1-5-5V13a5 5 0 0 1 5-5Z"/>'
      + '<path class="mc-companion-fold" d="M54 8v12h12"/>'
      + '<rect class="mc-companion-label" x="26" y="26" width="32" height="27" rx="6"/>'
      + '<g class="mc-companion-face">' + faces[mood] + '</g>'
      + '<g class="mc-companion-contacts"><path d="M29 60v5m8-5v5m8-5v5m8-5v5"/></g>'
      + extras[mood] + '</svg>';
  }

  function enhance() {
    frame = 0;
    const app = document.querySelector('#app');
    if (!app || typeof state === 'undefined') return;
    const targets = new Map();
    function collect(selector, mood) {
      app.querySelectorAll(selector).forEach(el => {
        // Never turn an error, a form hint or a loading message into a cute state.
        if (!el.closest('form,dialog,.modal-backdrop,[role="alert"],[aria-busy="true"]')) targets.set(el, mood);
      });
    }
    if (state.view === 'games') {
      const search = app.querySelector('#search');
      collect('.title-search-empty', 'search');
      collect('.content > .empty', search?.value.trim() ? 'search' : 'welcome');
    } else if (state.view === 'backlog') {
      const searching = !!app.querySelector('[data-v23-search]')?.value.trim();
      collect('.v23-backlog-empty', searching ? 'search' : 'sleepy');
    } else if (state.view === 'collections') {
      collect('.v16-collection-cards > .empty,.content > .panel > .empty', 'collection');
    } else if (state.view === 'playing') {
      collect('.playing-group .empty', 'sleepy');
    } else if (state.view === 'timeline') {
      collect('.content > .empty', 'welcome');
    }

    app.querySelectorAll('.mc-companion-empty').forEach(el => {
      if (targets.has(el)) return;
      el.querySelector(':scope > .mc-companion')?.remove();
      el.classList.remove('mc-companion-empty');
    });
    targets.forEach((mood, el) => {
      let art = el.querySelector(':scope > .mc-companion');
      if (!art) {
        art = document.createElement('span');
        art.className = 'mc-companion';
        art.setAttribute('aria-hidden', 'true');
        el.prepend(art);
      }
      if (art.dataset.mood !== mood) {
        art.dataset.mood = mood;
        art.innerHTML = markup(mood);
      }
      el.classList.add('mc-companion-empty');
    });
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(enhance);
  }
  // Existing v66 enhancement emits after normal renders and legacy root changes.
  document.addEventListener('mc:experience-ready', schedule);
  // Library search and Backlog filtering update their lists without a full render.
  document.addEventListener('input', event => {
    if (event.target instanceof Element && event.target.matches('#search,[data-v23-search]')) schedule();
  });
  document.addEventListener('change', event => {
    if (event.target instanceof Element && event.target.matches('#statusFilter,#platformFilter')) schedule();
  });
  document.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('[data-v23-filter],[data-v23-add-platform],[data-mc-clear-search],[data-mc-status]')) schedule();
  });
  window.addEventListener('pageshow', schedule);
  schedule();
})();
