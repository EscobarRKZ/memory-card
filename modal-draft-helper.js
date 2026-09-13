(() => {
  const TRACKED = new Set(['gameForm', 'playingForm', 'finishRotationForm']);
  let draft = null;
  let restoring = false;

  function trackedForm(node = document) {
    const form = node.querySelector?.('#gameForm, #playingForm, #finishRotationForm');
    return form && TRACKED.has(form.id) ? form : null;
  }

  function readForm(form) {
    if (!form || !TRACKED.has(form.id) || restoring) return;
    const values = {};
    for (const el of form.querySelectorAll('input[name], select[name], textarea[name]')) {
      if (el.disabled) continue;
      const name = el.name;
      if (!name) continue;
      if (el.type === 'checkbox') values[name] = { type: 'checkbox', checked: el.checked };
      else if (el.type === 'radio') {
        if (el.checked) values[name] = { type: 'radio', value: el.value };
      } else values[name] = { type: 'value', value: el.value };
    }

    const active = document.activeElement;
    let focus = null;
    if (active && form.contains(active) && active.name) {
      focus = {
        name: active.name,
        start: typeof active.selectionStart === 'number' ? active.selectionStart : null,
        end: typeof active.selectionEnd === 'number' ? active.selectionEnd : null,
      };
    }
    draft = { formId: form.id, values, focus, touchedAt: Date.now() };
  }

  function updateRatingUi(form) {
    const hidden = form.querySelector('input[name="rating"]');
    if (!hidden) return;
    const value = Math.max(0, Math.min(10, Number(hidden.value) || 0));
    form.querySelectorAll('[data-rating]').forEach(btn => {
      btn.classList.toggle('selected', Number(btn.dataset.rating) <= value);
    });
    const label = form.querySelector('.star-value');
    if (label) label.textContent = value ? `${value}/10` : '—';
  }

  function restoreForm(form) {
    if (!draft || !form || draft.formId !== form.id || restoring) return;
    restoring = true;
    try {
      for (const el of form.querySelectorAll('input[name], select[name], textarea[name]')) {
        const saved = draft.values[el.name];
        if (!saved) continue;
        if (saved.type === 'checkbox') el.checked = Boolean(saved.checked);
        else if (saved.type === 'radio') el.checked = el.value === saved.value;
        else el.value = saved.value ?? '';
      }
      updateRatingUi(form);

      const focus = draft.focus;
      if (focus?.name) {
        const target = [...form.querySelectorAll('[name]')].find(el => el.name === focus.name && !el.disabled);
        if (target) {
          try { target.focus({ preventScroll: true }); } catch (_) { target.focus(); }
          if (focus.start != null && typeof target.setSelectionRange === 'function') {
            try { target.setSelectionRange(focus.start, focus.end ?? focus.start); } catch (_) {}
          }
        }
      }
    } finally {
      restoring = false;
    }
  }

  function snapshotSoon() {
    queueMicrotask(() => {
      const form = trackedForm();
      if (form) readForm(form);
    });
  }

  document.addEventListener('input', event => {
    const form = event.target?.closest?.('form');
    if (form && TRACKED.has(form.id)) readForm(form);
  });

  document.addEventListener('change', event => {
    const form = event.target?.closest?.('form');
    if (form && TRACKED.has(form.id)) snapshotSoon();
  });

  document.addEventListener('click', event => {
    const target = event.target?.closest?.('[data-catalog-select], [data-rating]');
    if (target) snapshotSoon();

    const closer = event.target?.closest?.('[data-action="close"], [data-action="delete"]');
    if (closer && closer.closest?.('.modal-backdrop')) draft = null;
  });

  document.addEventListener('submit', event => {
    if (event.target && TRACKED.has(event.target.id)) draft = null;
  });

  const root = document.querySelector('#app') || document.body;
  const observer = new MutationObserver(() => {
    const form = trackedForm();
    if (!form || !draft || draft.formId !== form.id) return;
    restoreForm(form);
  });
  observer.observe(root, { childList: true, subtree: true });
})();