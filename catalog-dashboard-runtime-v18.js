(() => {
  const baseUpdateCatalogStatusDomV174 = updateCatalogStatusDom;

  updateCatalogStatusDom = function() {
    const el = document.querySelector('#catalogStatus');
    if (!el || !el.classList.contains('mc-catalog-platforms')) {
      return baseUpdateCatalogStatusDomV174();
    }

    const counts = typeof catalogCounts === 'function' ? catalogCounts() : {};
    const rows = PLATFORMS.map(p => ({ ...p, count: Number(counts[p.id] || 0) }));
    el.innerHTML = rows.map(p => `<span class="mc-catalog-platform ${p.count ? '' : 'is-empty'}" title="${esc(p.name)}"><b>${esc(p.abbr)}</b><strong>${p.count.toLocaleString('ru-RU')}</strong></span>`).join('');

    const summary = document.querySelector('.mc-catalog-summary');
    const cards = summary ? [...summary.children] : [];
    if (cards[0]) {
      const value = cards[0].querySelector('b');
      if (value) value.textContent = rows.reduce((sum, p) => sum + p.count, 0).toLocaleString('ru-RU');
    }
    if (cards[1]) {
      const value = cards[1].querySelector('b');
      if (value) value.textContent = `${rows.filter(p => p.count > 0).length}/${rows.length}`;
    }
  };
})();
