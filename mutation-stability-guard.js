(() => {
  const NativeMutationObserver = window.MutationObserver;
  if (typeof NativeMutationObserver !== 'function') return;

  class StableMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.targets = [];
      this.pending = false;
      this.records = [];
      this.reconnectQueued = false;
      this.native = new NativeMutationObserver(records => {
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
      this.reconnectQueued = false;
    }

    takeRecords() {
      const nativeRecords = this.native.takeRecords();
      const all = this.records.concat(nativeRecords);
      this.records = [];
      return all;
    }

    reconnect() {
      for (const { target, options } of this.targets) {
        if (target?.isConnected || target === document || target === document.body) {
          try { this.native.observe(target, options); } catch (_) {}
        }
      }
    }

    flush() {
      if (!this.pending) return;
      this.pending = false;
      const records = this.records.splice(0);
      this.native.disconnect();
      try {
        this.callback(records, this);
      } catch (error) {
        console.error('Memory Card enhancement observer failed:', error);
      }

      if (!this.reconnectQueued) {
        this.reconnectQueued = true;
        queueMicrotask(() => {
          this.reconnectQueued = false;
          this.reconnect();
        });
      }
    }
  }

  StableMutationObserver.prototype = NativeMutationObserver.prototype;
  window.MutationObserver = StableMutationObserver;
})();
