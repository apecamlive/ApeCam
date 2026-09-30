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
  /**
   * Increments a counter; the TTL is set when the key is created (fixed window). Returns the new value
   * and the seconds left in the window. Used for rate limiting.
   */
  incr(key: string, ttlSec: number): Promise<{ count: number; ttlSec: number }>;
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

  async incr(key: string, ttlSec: number) {
    const current = await this.get(key);
    const entry = this.data.get(key);
    const count = (current ? Number(current) : 0) + 1;
    const expiresAt = entry?.expiresAt ?? this.now() + ttlSec * 1000;
    this.data.set(key, { value: String(count), expiresAt });
    return { count, ttlSec: Math.max(1, Math.ceil((expiresAt - this.now()) / 1000)) };
  }
}

/** The subset of the ioredis client we use, so this package does not depend on ioredis. */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  set(key: string, value: string, secondsToken: 'EX', seconds: number): Promise<unknown>;
  getdel(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
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

  async incr(key: string, ttlSec: number) {
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, ttlSec);
    let ttl = await this.redis.ttl(key);
    // A crash between INCR and EXPIRE would leave a counter without TTL (-1): repair it.
    if (ttl < 0) {
      await this.redis.expire(key, ttlSec);
      ttl = ttlSec;
    }
    return { count, ttlSec: ttl };
  }
}
