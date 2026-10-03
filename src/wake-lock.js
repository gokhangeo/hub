// Optional: Safari/PWA may deny a lock. Transfer correctness never depends on it.
export class TransferWakeLock {
  constructor(navigator = globalThis.navigator, document = globalThis.document) {
    this.navigator = navigator;
    this.document = document;
    this.lock = null;
    this.pending = null;
    this.active = false;
  }
  async setActive(active) {
    this.active = active;
    if (!active) { const lock = this.lock; this.lock = null; await lock?.release().catch(() => {}); return; }
    if (this.lock || this.pending || this.document.visibilityState === 'hidden' || !this.navigator.wakeLock?.request) return;
    this.pending = this.navigator.wakeLock.request('screen');
    try {
      const lock = await this.pending;
      if (!this.active || this.document.visibilityState === 'hidden') { await lock.release(); return; }
      this.lock = lock;
      lock.addEventListener('release', () => { if (this.lock === lock) this.lock = null; }, { once: true });
    } catch { /* Unsupported, low battery or permission denied: keep the UI usable. */ }
    finally { this.pending = null; }
  }
}
