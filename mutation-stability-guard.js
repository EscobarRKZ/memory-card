/* Memory Card observer stability guard
 * Loaded after the legacy UI helpers, but before product-v14/v16/v17.
 * Later enhancement layers mutate #app while observing it. This wrapper
 * disconnects each observer while its callback runs and coalesces mutation
 * bursts to one callback per animation frame, preventing self-trigger loops.
 */
(() => {
  const NativeMutationObserver = window.MutationObserver;
  if (typeof NativeMutationObserver !== 'function') return;

  class StableMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.targets = [];
      this.pending = false;
      this.records = [];
      this.native = new NativeMutationObserver((records, observer) => {
        this.records.push(...records);
        if (this.pending) return;
        this.pending = true;
        requestAnimationFrame(() => this.flush());
      });
    }

    observe(target, options) {
      if (!target) return;
      const existing = this.targets.find(x => x.target === target);
      if (existing) existing.options = options;
      else this.targets.push({ target, options });
      this.native.observe(target, options);
    }

    disconnect() {
      this.native.disconnect();
      this.targets = [];
      this.records = [];
      this.pending = false;
    }

    takeRecords() {
      const nativeRecords = this.native.takeRecords();
      const all = this.records.concat(nativeRecords);
      this.records = [];
      return all;
    }

    flush() {
      if (!this.pending) return;
      this.pending = false;
      const records = this.records.splice(0);
      const targets = this.targets.slice();

      // Crucial: enhancement callbacks must not observe the DOM nodes they
      // themselves append/reorder. Reconnect only after the callback ends.
      this.native.disconnect();
      try {
        this.callback(records, this);
      } catch (error) {
        console.error('Memory Card enhancement observer failed:', error);
      } finally {
        for (const { target, options } of targets) {
          if (target?.isConnected || target === document || target === document.body) {
            try { this.native.observe(target, options); } catch (_) {}
          }
        }
      }
    }
  }

  StableMutationObserver.prototype = NativeMutationObserver.prototype;
  window.MutationObserver = StableMutationObserver;
})();
