/* v25 — reliable editing from game details and the library. */
(() => {
  // Library cards are rerendered by the core app, so add the action at markup time
  // rather than attaching short-lived listeners to individual DOM nodes.
  if (typeof gameCard === 'function') {
    const originalGameCard = gameCard;
    gameCard = function (game) {
      const markup = originalGameCard(game);
      if (!game || !game.id || markup.includes('mc-card-edit')) return markup;
      const label = state?.settings?.language === 'en' ? 'Edit' : 'Изменить';
      const safeId = esc(String(game.id));
      const safeTitle = esc(String(game.title || ''));
      const button = `<button type="button" class="mc-card-edit" data-mc-card-edit="${safeId}" aria-label="${label}: ${safeTitle}">✎ ${label}</button>`;
      return markup.replace(/<\/div><\/article>\s*$/, `${button}</div></article>`);
    };
  }

  // The v16 detail page used to call baseOpenGameV16 (view modal) on EDIT.
  // Handle both old and new buttons in capture phase, before a parent card's
  // data-game click listener can reopen the detail page or replace the modal.
  document.addEventListener('click', event => {
    const target = event.target instanceof Element
      ? event.target.closest('[data-v16-edit], [data-action="edit"], [data-mc-card-edit]')
      : null;
    if (!target || target.disabled) return;

    const id = target.dataset.v16Edit || target.dataset.mcCardEdit || target.dataset.id;
    const game = (state.games || []).find(item => item && !item.deletedAt && String(item.id) === String(id || ''));
    if (!game) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    openEdit(game.id);
  }, true);
})();
