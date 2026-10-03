import { describe, expect, it, vi } from 'vitest';
import { TransferWakeLock } from '../src/wake-lock.js';
describe('optional screen wake lock', () => {
  it('unsupported and denied locks do not block transfers', async () => {
    await new TransferWakeLock({}, {visibilityState:'visible'}).setActive(true);
    const wake = new TransferWakeLock({wakeLock:{request:vi.fn().mockRejectedValue(new Error('denied'))}}, {visibilityState:'visible'});
    await wake.setActive(true); expect(wake.lock).toBeNull();
  });
  it('releases a pending lock if the transfer ends before acquisition', async () => {
    let resolve; const release = vi.fn().mockResolvedValue();
    const wake = new TransferWakeLock({wakeLock:{request:() => new Promise((r) => {resolve=r;})}}, {visibilityState:'visible'});
    const acquiring = wake.setActive(true);
    await wake.setActive(false); resolve({release,addEventListener:vi.fn()}); await acquiring;
    expect(release).toHaveBeenCalledOnce();expect(wake.lock).toBeNull();
  });
});
