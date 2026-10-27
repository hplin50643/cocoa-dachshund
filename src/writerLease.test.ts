import { afterEach, describe, expect, it, vi } from 'vitest';
import { WriterLease, WRITER_LEASE_KEY, type LeaseStorage } from './writerLease';

function memoryStorage(): LeaseStorage {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn(key => values.get(key) ?? null),
    setItem: vi.fn((key, value) => { values.set(key, value); }),
    removeItem: vi.fn(key => { values.delete(key); }),
  };
}
const immediate = async () => undefined;

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('localStorage single-writer fallback', () => {
  it('allows one tab at a time and a successor after release', async () => {
    const storage = memoryStorage();
    const options = { storage, now: () => 1000, wait: immediate };
    const a = new WriterLease({ ...options, token: 'tab-a' });
    const b = new WriterLease({ ...options, token: 'tab-b' });
    expect(await a.acquire()).toBe('acquired');
    expect(a.owns()).toBe(true);
    expect(await b.acquire()).toBe('busy');
    expect(b.owns()).toBe(false);
    a.release();
    expect(a.owns()).toBe(false);
    expect(await b.acquire()).toBe('acquired');
    expect(b.owns()).toBe(true);
  });

  it('settles simultaneous claims so only the last owner can proceed', async () => {
    const backing = memoryStorage();
    let staleReads = 2;
    const storage: LeaseStorage = {
      getItem(key) { if (key === WRITER_LEASE_KEY && staleReads-- > 0) return null; return backing.getItem(key); },
      setItem: (key, value) => backing.setItem(key, value),
      removeItem: key => backing.removeItem(key),
    };
    const settlers: Array<() => void> = [];
    const wait = () => new Promise<void>(resolve => { settlers.push(resolve); });
    const a = new WriterLease({ storage, now: () => 1000, token: 'tab-a', wait });
    const b = new WriterLease({ storage, now: () => 1000, token: 'tab-b', wait });
    const pendingA = a.acquire();
    const pendingB = b.acquire();
    expect(settlers).toHaveLength(2);
    settlers.forEach(resolve => resolve());
    expect(await pendingA).toBe('busy');
    expect(await pendingB).toBe('acquired');
    expect(a.owns()).toBe(false);
    expect(b.owns()).toBe(true);
  });

  it('recovers expired leases and never lets an old owner release a new lease', async () => {
    const storage = memoryStorage();
    let now = 1000;
    const options = { storage, now: () => now, leaseMs: 30_000, wait: immediate };
    const a = new WriterLease({ ...options, token: 'tab-a' });
    const b = new WriterLease({ ...options, token: 'tab-b' });
    expect(await a.acquire()).toBe('acquired');
    now += 30_000;
    expect(a.owns()).toBe(false);
    expect(await b.acquire()).toBe('acquired');
    a.release();
    expect(b.owns()).toBe(true);
    expect(JSON.parse(storage.getItem(WRITER_LEASE_KEY)!).token).toBe('tab-b');
  });

  it('renews a live lease and rejects renewal after ownership is replaced', async () => {
    const storage = memoryStorage();
    let now = 1000;
    const options = { storage, now: () => now, leaseMs: 30_000, wait: immediate };
    const a = new WriterLease({ ...options, token: 'tab-a' });
    const b = new WriterLease({ ...options, token: 'tab-b' });
    expect(await a.acquire()).toBe('acquired');
    now += 10_000;
    expect(a.renew()).toBe(true);
    expect(JSON.parse(storage.getItem(WRITER_LEASE_KEY)!).expiresAt).toBe(41_000);
    now = 31_000;
    expect(await b.acquire()).toBe('busy');
    now = 41_000;
    expect(await b.acquire()).toBe('acquired');
    expect(a.renew()).toBe(false);
    expect(b.owns()).toBe(true);
  });

  it('periodically renews, calls onLost once after replacement, and stops heartbeats', async () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    let now = 1000;
    const lease = new WriterLease({ storage, now: () => now, leaseMs: 30_000, token: 'tab-a', wait: immediate });
    expect(await lease.acquire()).toBe('acquired');
    const onLost = vi.fn();
    lease.startHeartbeat(onLost);
    now = 11_000;
    vi.advanceTimersByTime(10_000);
    expect(JSON.parse(storage.getItem(WRITER_LEASE_KEY)!).expiresAt).toBe(41_000);
    storage.setItem(WRITER_LEASE_KEY, JSON.stringify({token:'tab-b',expiresAt:50_000}));
    now = 21_000;
    vi.advanceTimersByTime(10_000);
    expect(onLost).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30_000);
    expect(onLost).toHaveBeenCalledTimes(1);
    expect(lease.owns()).toBe(false);
  });

  it('reports unavailable rather than assuming ownership when storage is absent, blocked or full', async () => {
    vi.stubGlobal('localStorage', undefined);
    expect(await new WriterLease({ token: 'none', wait: immediate }).acquire()).toBe('unavailable');
    const blocked: LeaseStorage = {
      getItem: () => { throw new DOMException('blocked', 'SecurityError'); },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(await new WriterLease({ storage: blocked, token: 'blocked', wait: immediate }).acquire()).toBe('unavailable');
    const full: LeaseStorage = {
      getItem: () => null,
      setItem: () => { throw new DOMException('full', 'QuotaExceededError'); },
      removeItem: vi.fn(),
    };
    const lease = new WriterLease({ storage: full, token: 'full', wait: immediate });
    expect(await lease.acquire()).toBe('unavailable');
    expect(lease.owns()).toBe(false);
    lease.release();
    expect(full.removeItem).not.toHaveBeenCalled();
  });

  it('uses only the separate lease key and tolerates malformed stale lease data', async () => {
    const storage = memoryStorage();
    const petKey = 'cocoa-dachshund:save:v1';
    storage.setItem(petKey, '{"pet":"important"}');
    storage.setItem(WRITER_LEASE_KEY, '{broken');
    const lease = new WriterLease({ storage, now: () => 1000, token: 'tab-a', wait: immediate });
    expect(await lease.acquire()).toBe('acquired');
    lease.release();
    expect(storage.getItem(petKey)).toBe('{"pet":"important"}');
  });
});
