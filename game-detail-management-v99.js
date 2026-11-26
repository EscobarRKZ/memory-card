/* v99: manage unfinished game records from their full detail page.
   No production records are touched until a user confirms an action. */
(() => {
  'use strict';
  let busy = false;

  const tr = (ru, en) => state.settings?.language === 'en' ? en : ru;
  const unfinished = game => !!game && (game.status === 'playing' || game.status === 'dropped');

  function detailGame() {
    if (state.view !== 'gameDetail') return null;
    return (state.games || []).find(game =>
      game && !game.deletedAt && String(game.id) === String(state.gameDetailId || '')
    ) || null;
  }

  function enhanceGameManagement() {
    const game = detailGame();
    const actions = document.querySelector('#app .v16-detail-actions');
    if (!actions || !unfinished(game)) return;
    if (actions.parentElement?.querySelector('.v99-detail-management')) return;

    // The existing detail renderer labels every non-playing game "completed".
    // A dropped game is still unfinished and must display its actual status.
    if (game.status === 'dropped') {
      const statusBadge = document.querySelector('#app .v16-detail-copy .v16-badge-row > span:last-child');
      if (statusBadge) statusBadge.textContent = tr('Брошено', 'Dropped');
    }

    const row = document.createElement('div');
    row.className = 'v99-detail-management';
    const buttons = [
      { action: 'backlog', className: 'secondary', label: tr('В Backlog', 'Move to Backlog') },
      { action: 'delete', className: 'danger', label: tr('Удалить игру', 'Delete game') }
    ];
    buttons.forEach(item => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = item.className;
      button.textContent = item.label;
      button.dataset.mcV99Action = item.action;
      button.dataset.mcV99GameId = String(game.id);
      row.append(button);
    });
    actions.after(row);
  }

  const baseRender = render;
  render = function (...args) {
    const result = baseRender.apply(this, args);
    queueMicrotask(enhanceGameManagement);
    return result;
  };
  queueMicrotask(enhanceGameManagement);

  async function updateUnfinishedGame(action, id) {
    if (busy || (action !== 'backlog' && action !== 'delete')) return;
    const game = detailGame();
    if (!unfinished(game) || String(game.id) !== String(id)) return;

    const approved = action === 'delete'
      ? confirm(tr(
          `Удалить «${game.title}» из Memory Card? Игра исчезнет из библиотеки после синхронизации.`,
          `Delete “${game.title}” from Memory Card? It will disappear from your library after syncing.`
        ))
      : confirm(tr(
          `Переместить «${game.title}» в Backlog? Название, обложка и заметки сохранятся.`,
          `Move “${game.title}” to Backlog? Its title, cover and notes will be kept.`
        ));
    if (!approved) return;

    busy = true;
    const previous = {
      status: game.status,
      updatedAt: game.updatedAt,
      deletedAt: game.deletedAt
    };
    try {
      const updated = nowIso();
      if (action === 'delete') game.deletedAt = updated;
      else game.status = 'backlog';
      game.updatedAt = updated;
      await persist();
      state.gameDetailId = '';
      state.modal = null;
      navigate(action === 'backlog' ? 'backlog' : 'games');
      // Backlog remembers its own platform filter. Show the moved game even
      // when the previous filter was for a different console.
      if (action === 'backlog') {
        document.querySelector('[data-v23-filter="ALL"]')?.click();
      }
      scheduleAutoSync();
      setToast(action === 'backlog'
        ? tr('Игра перемещена в Backlog', 'Moved to Backlog')
        : tr('Игра удалена', 'Game deleted'),{render:false});
    } catch (error) {
      game.status = previous.status;
      game.updatedAt = previous.updatedAt;
      if (previous.deletedAt == null) delete game.deletedAt;
      else game.deletedAt = previous.deletedAt;
      console.error('Game detail management failed', error);
      render();
      setToast(tr('Не удалось сохранить изменение. Попробуй ещё раз.', 'Could not save the change. Please retry.'),{render:false});
    } finally {
      busy = false;
    }
  }

  document.addEventListener('click', event => {
    const button = event.target instanceof Element
      ? event.target.closest('[data-mc-v99-action]')
      : null;
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    updateUnfinishedGame(button.dataset.mcV99Action, button.dataset.mcV99GameId)
      .catch(error => console.error('Game detail action failed', error));
  }, true);
})();
