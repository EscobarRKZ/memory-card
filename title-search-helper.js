/* v76: word-wise library search with quiet, reversible match highlighting. */
(() => {
  let frame = 0;
  const titleCache = new WeakMap();
  const composing = new WeakSet();
  const normalize = value => String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9а-яё]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  function indexTitle(raw) {
    // Map normalized characters back to original UTF-16 ranges. Accents,
    // punctuation, original casing and emoji remain untouched in the heading.
    let text = '', offset = 0;
    const starts = [], ends = [];
    for (const character of raw) {
      const start = offset;
      offset += character.length;
      const folded = character.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
      if (!folded && ends.length) ends[ends.length - 1] = offset;
      for (const part of folded) {
        if (/[a-z0-9а-яё]/i.test(part)) {
          text += part; starts.push(start); ends.push(offset);
        } else if (text && !text.endsWith(' ')) {
          text += ' '; starts.push(start); ends.push(offset);
        }
      }
    }
    return {text, starts, ends};
  }

  function titleFor(card) {
    const heading = card.querySelector('.game-body h3');
    const raw = heading?.textContent || '';
    let entry = titleCache.get(card);
    if (!entry || entry.heading !== heading || entry.raw !== raw) {
      entry = {heading, raw, ...indexTitle(raw), painted: null};
      titleCache.set(card, entry);
    }
    return entry;
  }

  function highlight(entry, terms, key) {
    const heading = entry.heading;
    if (!heading || entry.painted === key) return;
    // Current titles are plain text. Leave any future interactive/custom child
    // intact rather than replacing its handlers or accessible content.
    if ([...heading.children].some(child => !child.matches('mark.mc-search-match'))) return;
    entry.painted = key;
    if (!terms.length) {
      if (heading.querySelector('mark.mc-search-match')) heading.replaceChildren(document.createTextNode(entry.raw));
      return;
    }
    const ranges = [];
    for (const term of terms) {
      let at = entry.text.indexOf(term);
      while (at !== -1) {
        ranges.push([entry.starts[at], entry.ends[at + term.length - 1]]);
        at = entry.text.indexOf(term, at + term.length);
      }
    }
    ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const merged = [];
    for (const range of ranges) {
      const last = merged[merged.length - 1];
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
      else merged.push([...range]);
    }
    const fragment = document.createDocumentFragment();
    let from = 0;
    for (const [start, end] of merged) {
      fragment.appendChild(document.createTextNode(entry.raw.slice(from, start)));
      const mark = document.createElement('mark');
      mark.className = 'mc-search-match';
      mark.textContent = entry.raw.slice(start, end);
      fragment.appendChild(mark);
      from = end;
    }
    fragment.appendChild(document.createTextNode(entry.raw.slice(from)));
    heading.replaceChildren(fragment);
  }

  function setHidden(element, hidden) {
    if (element && element.hidden !== hidden) element.hidden = hidden;
  }

  function apply() {
    frame = 0;
    if (state?.view !== 'games') return;
    const search = document.querySelector('#search');
    if (!(search instanceof HTMLInputElement) || composing.has(search)) return;
    // The library can render an empty state instead of a grid for zero items.
    document.querySelectorAll('[data-mc-clear-search]').forEach(button => {
      button.hidden = !search.value;
    });
    const grid = document.querySelector('.game-grid');
    if (!grid) return;

    const query = normalize(search.value);
    const terms = [...new Set(query.split(' ').filter(Boolean))].sort();
    const key = terms.join('\0');
    const cards = grid.querySelectorAll(':scope > .game-card');
    let visible = 0;
    for (const card of cards) {
      // Initial/cleared search does not build title indexes needlessly.
      if (!terms.length) {
        setHidden(card, false);
        if (titleCache.get(card)?.painted) highlight(titleFor(card), [], '');
        visible++;
        continue;
      }
      const entry = titleFor(card);
      const matches = terms.every(term => entry.text.includes(term));
      setHidden(card, !matches);
      highlight(entry, matches ? terms : [], matches ? key : '');
      if (matches) visible++;
    }

    const caption = search.closest('.content')?.querySelector(':scope > .section-head p');
    const label = state?.settings?.language === 'en' ? `Games found: ${visible}` : `Найдено игр: ${visible}`;
    if (caption && caption.textContent !== label) caption.textContent = label;

    let empty = document.querySelector('.title-search-empty');
    if (query && visible === 0) {
      if (!empty) {
        empty = document.createElement('div');
        empty.className = 'empty title-search-empty';
        empty.textContent = state?.settings?.language === 'en'
          ? 'No matching titles. Try another name or clear the search.'
          : 'Совпадений нет. Попробуй другое название или сбрось поиск.';
        grid.insertAdjacentElement('afterend', empty);
      }
      setHidden(grid, true);
    } else {
      setHidden(grid, false);
      empty?.remove();
    }
  }

  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(apply);
  }

  window.MemoryCardApplyLibrarySearch = schedule;

  document.addEventListener('input', event => {
    if (event.target instanceof HTMLInputElement && event.target.id === 'search') {
      state.search = event.target.value;
      if (!event.isComposing && !composing.has(event.target)) schedule();
    }
  });
  document.addEventListener('change', event => {
    if (event.target instanceof HTMLElement && ['statusFilter','platformFilter','gamesSort','gamesView'].includes(event.target.id)) schedule();
  });
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.nav button, .mobile-nav button, [data-action="clear-platform"]')) schedule();
  });
  document.addEventListener('compositionstart', event => {
    if (event.target instanceof HTMLInputElement && event.target.id === 'search') composing.add(event.target);
  });
  document.addEventListener('compositionend', event => {
    if (event.target instanceof HTMLInputElement && event.target.id === 'search') {
      composing.delete(event.target);
      state.search = event.target.value;
      schedule();
    }
  });
  document.addEventListener('search', event => {
    if (event.target instanceof HTMLInputElement && event.target.id === 'search') {
      state.search = event.target.value;
      schedule();
    }
  });
  window.addEventListener('load', schedule);
  window.addEventListener('pageshow', schedule);
})();
