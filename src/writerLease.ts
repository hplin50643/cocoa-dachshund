/** Single-writer fallback for browsers without navigator.locks.
 * The lease is separate from the pet data, and no credentials or save data are stored here.
 */
export const WRITER_LEASE_KEY = 'cocoa-dachshund:writer-lease:v1';
export type LeaseStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type LeaseAcquireResult = 'acquired' | 'busy' | 'unavailable';
export interface WriterLeaseOptions {
  storage?: LeaseStorage;
  now?: () => number;
  token?: string;
  leaseMs?: number;
  settleMs?: number;
  wait?: (milliseconds: number) => Promise<void>;
}
interface LeaseRecord { token: string; expiresAt: number }

function randomToken(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (globalThis.crypto?.getRandomValues) {
    return Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4)), value => value.toString(36)).join('-');
  }
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2);
}

function parseLease(raw: string | null): LeaseRecord | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const candidate = parsed as Record<string, unknown>;
    if (typeof candidate.token !== 'string' || candidate.token.length < 1 || candidate.token.length > 128 ||
      typeof candidate.expiresAt !== 'number' || !Number.isFinite(candidate.expiresAt)) return null;
    return { token: candidate.token, expiresAt: candidate.expiresAt };
  } catch { return null; }
}

export class WriterLease {
  private readonly providedStorage?: LeaseStorage;
  private readonly now: () => number;
  private readonly token: string;
  private readonly leaseMs: number;
  private readonly settleMs: number;
  private readonly wait: (milliseconds: number) => Promise<void>;
  private active = false;
  private heartbeat: ReturnType<typeof setInterval> | undefined;

  constructor(options: WriterLeaseOptions = {}) {
    this.providedStorage = options.storage;
    this.now = options.now ?? Date.now;
    this.token = options.token ?? randomToken();
    this.leaseMs = options.leaseMs ?? 30_000;
    this.settleMs = options.settleMs ?? 80;
    this.wait = options.wait ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
    if (!this.token || this.token.length > 128 || !Number.isFinite(this.leaseMs) || this.leaseMs <= 0 ||
        !Number.isFinite(this.settleMs) || this.settleMs < 0 || this.settleMs >= this.leaseMs) {
      throw new Error('寫入租約設定不正確。');
    }
  }

  private storage(): LeaseStorage {
    const storage = this.providedStorage ?? globalThis.localStorage;
    if (!storage) throw new Error('本機儲存無法使用。');
    return storage;
  }

  /** Claim, briefly yield to competing claims, and verify the final winner. */
  async acquire(): Promise<LeaseAcquireResult> {
    this.active = false;
    try {
      const storage = this.storage();
      const current = parseLease(storage.getItem(WRITER_LEASE_KEY));
      const now = this.now();
      if (!Number.isFinite(now)) return 'unavailable';
      if (current && current.expiresAt > now && current.token !== this.token) return 'busy';
      storage.setItem(WRITER_LEASE_KEY, JSON.stringify({ token: this.token, expiresAt: now + this.leaseMs }));
      await this.wait(this.settleMs);
      const claimed = parseLease(storage.getItem(WRITER_LEASE_KEY));
      if (!claimed || claimed.token !== this.token || claimed.expiresAt <= this.now()) return 'busy';
      this.active = true;
      return 'acquired';
    } catch { this.active = false; return 'unavailable'; }
  }

  /** Synchronous guard immediately before a write or other ownership-sensitive operation. */
  owns(): boolean {
    if (!this.active) return false;
    try {
      const lease = parseLease(this.storage().getItem(WRITER_LEASE_KEY));
      const owned = lease !== null && lease.token === this.token && lease.expiresAt > this.now();
      if (!owned) this.active = false;
      return owned;
    } catch { this.active = false; return false; }
  }

  renew(): boolean {
    if (!this.owns()) return false;
    try {
      const now = this.now();
      if (!Number.isFinite(now)) { this.active = false; return false; }
      const storage = this.storage();
      storage.setItem(WRITER_LEASE_KEY, JSON.stringify({ token: this.token, expiresAt: now + this.leaseMs }));
      return this.owns();
    } catch { this.active = false; return false; }
  }

  /** Stop renewal and notify once when a lease is replaced, expired, or inaccessible. */
  startHeartbeat(onLost: () => void): () => void {
    if (this.heartbeat !== undefined) clearInterval(this.heartbeat);
    const interval = Math.max(1, Math.floor(this.leaseMs / 3));
    this.heartbeat = setInterval(() => {
      if (this.renew()) return;
      if (this.heartbeat !== undefined) clearInterval(this.heartbeat);
      this.heartbeat = undefined;
      onLost();
    }, interval);
    return () => {
      if (this.heartbeat !== undefined) clearInterval(this.heartbeat);
      this.heartbeat = undefined;
    };
  }

  /** Never delete a lease that another tab owns. */
  release(): void {
    if (this.heartbeat !== undefined) clearInterval(this.heartbeat);
    this.heartbeat = undefined;
    try {
      const storage = this.storage();
      const lease = parseLease(storage.getItem(WRITER_LEASE_KEY));
      if (lease?.token === this.token) storage.removeItem(WRITER_LEASE_KEY);
    } catch { /* Storage may have become unavailable; the lease will expire. */ }
    this.active = false;
  }
}
