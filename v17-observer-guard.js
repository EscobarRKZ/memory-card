/* Memory Card v0.17.1 — stability guard
 * product-v16 already owns the app-wide DOM observer. v0.17 only needs its
 * post-render enhancer, so suppress the next MutationObserver created by
 * product-v17 and immediately restore the native constructor afterwards.
 */
(() => {
  const NativeMutationObserver = window.MutationObserver;
  if (typeof NativeMutationObserver !== 'function') return;

  let suppressNext = true;
  function GuardedMutationObserver(callback) {
    if (suppressNext) {
      suppressNext = false;
      window.MutationObserver = NativeMutationObserver;
      return {
        observe() {},
        disconnect() {},
        takeRecords() { return []; }
      };
    }
    return new NativeMutationObserver(callback);
  }

  GuardedMutationObserver.prototype = NativeMutationObserver.prototype;
  window.MutationObserver = GuardedMutationObserver;

  // Fail-safe: never leave the patched constructor installed if product-v17
  // changes and does not construct its observer synchronously.
  setTimeout(() => {
    if (window.MutationObserver === GuardedMutationObserver) {
      window.MutationObserver = NativeMutationObserver;
    }
  }, 0);
})();
