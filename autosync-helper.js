(() => {
  const DB_NAME = 'memory-card-db';
  const STORE = 'state';
  const KEY = 'main';
  const MIN_GAP_MS = 8000;
  let lastAttemptAt = 0;
  let scheduledTimer = null;

  const hook = document.createElement('button');
  hook.type = 'button';
  hook.id = 'memoryCardAutoSyncHook';
  hook.dataset.action = 'sync';
  hook.hidden = true;
  hook.tabIndex = -1;
  hook.setAttribute('aria-hidden', 'true');
  document.body.appendChild(hook);

  function readLocalState() {
    return new Promise(resolve => {
      if (!('indexedDB' in window)) return resolve(null);
      const request = indexedDB.open(DB_NAME, 1);
      request.onerror = () => resolve(null);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => {
        const db = request.result;
        try {
          const tx = db.transaction(STORE, 'readonly');
          const get = tx.objectStore(STORE).get(KEY);
          get.onsuccess = () => resolve(get.result || null);
          get.onerror = () => resolve(null);
          tx.oncomplete = () => db.close();
        } catch (_) {
          db.close();
          resolve(null);
        }
      };
    });
  }

  async function runAutoSync(reason = 'resume') {
    if (document.hidden || !navigator.onLine) return;
    const now = Date.now();
    if (now - lastAttemptAt < MIN_GAP_MS) return;

    const local = await readLocalState();
    const settings = local?.settings || {};
    if (settings.autoSync !== true || !String(settings.sheetEndpoint || '').trim()) return;

    const handler = hook.onclick;
    if (typeof handler !== 'function') {
      scheduleAutoSync(reason, 650);
      return;
    }

    lastAttemptAt = Date.now();
    try {
      await handler({ silent: true, skipSaveSettings: true, source: reason });
    } catch (err) {
      console.warn('Memory Card auto-sync helper:', err);
    }
  }

  function scheduleAutoSync(reason, delay = 500) {
    clearTimeout(scheduledTimer);
    scheduledTimer = setTimeout(() => runAutoSync(reason), delay);
  }

  window.addEventListener('load', () => scheduleAutoSync('open', 1600));
  window.addEventListener('pageshow', () => scheduleAutoSync('pageshow', 900));
  window.addEventListener('focus', () => scheduleAutoSync('focus', 700));
  window.addEventListener('online', () => scheduleAutoSync('online', 450));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleAutoSync('resume', 450);
  });

  document.addEventListener('change', event => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.id !== 'autoSync') return;
    const save = document.querySelector('[data-action="save-settings"]');
    if (save instanceof HTMLElement) save.click();
    if (target.checked) scheduleAutoSync('enabled', 700);
  });
})();
