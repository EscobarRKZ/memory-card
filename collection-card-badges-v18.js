/* Memory Card v0.17.3 — collection badges on library cards */
(() => {
  const baseGameCard = gameCard;

  function collectionsForGame(gameId) {
    const id = String(gameId || '');
    const list = Array.isArray(state?.settings?.collections) ? state.settings.collections : [];
    return list.filter(c => Array.isArray(c.gameIds) && c.gameIds.some(x => String(x) === id));
  }

  function badgeMarkup(gameId) {
    const list = collectionsForGame(gameId);
    if (!list.length) return '';
    const names = list.map(c => `${c.icon || '📚'} ${c.name || 'Коллекция'}`.trim());
    const title = esc(`В коллекциях: ${names.join(', ')}`);
    if (list.length === 1) {
      const c = list[0];
      return `<div class="mc-collection-card-badge is-single" title="${title}" aria-label="${title}"><span class="mc-collection-card-icon">${esc(c.icon || '📚')}</span><span class="mc-collection-card-name">${esc(c.name || 'Коллекция')}</span></div>`;
    }
    return `<div class="mc-collection-card-badge is-multiple" title="${title}" aria-label="${title}"><span class="mc-collection-card-icon">📚</span><span class="mc-collection-card-name">${list.length} коллекции</span><b>${list.length}</b></div>`;
  }

  gameCard = function(g) {
    const html = baseGameCard(g);
    const badge = badgeMarkup(g?.id);
    if (!badge) return html;
    return html.replace(/(<article class="game-card"[^>]*>)/, `$1${badge}`);
  };
})();
