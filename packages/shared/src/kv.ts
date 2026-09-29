/**
 * Minimal key-value surface APECAM needs from Redis: nonces, caches, flags.
 * Production uses Redis; tests and local runs without Redis use the in-memory store.
 */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec?: number): Promise<void>;
  /** Atomic read-and-delete. Used for single-use login nonces. */
  getdel(key: string): Promise<string | null>;
  del(key: string): Promise<void>;
}

export class MemoryKeyValueStore implements KeyValueStore {
  private data = new Map<string, { value: string; expiresAt?: number }>();

  constructor(private now: () => number = Date.now) {}

  async get(key: string) {
    const entry = this.data.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== undefined && entry.expiresAt <= this.now()) {
      this.data.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSec?: number) {
    this.data.set(key, { value, expiresAt: ttlSec ? this.now() + ttlSec * 1000 : undefined });
  }

  async getdel(key: string) {
    const value = await this.get(key);
    this.data.delete(key);
    return value;
  }

  async del(key: string) {
    this.data.delete(key);
  }
}

/** The subset of the ioredis client we use, so this package does not depend on ioredis. */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  set(key: string, value: string, secondsToken: 'EX', seconds: number): Promise<unknown>;
  getdel(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
}

export class RedisKeyValueStore implements KeyValueStore {
  constructor(private redis: RedisLike) {}

  get(key: string) {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSec?: number) {
    if (ttlSec) await this.redis.set(key, value, 'EX', ttlSec);
    else await this.redis.set(key, value);
  }

  getdel(key: string) {
    return this.redis.getdel(key);
  }

  async del(key: string) {
    await this.redis.del(key);
  }
}
