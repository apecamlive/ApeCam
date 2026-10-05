import { describe, expect, it } from 'vitest';
import { MemoryKeyValueStore } from './kv';

describe('MemoryKeyValueStore', () => {
  it('getdel returns the value once', async () => {
    const kv = new MemoryKeyValueStore();
    await kv.set('n', 'x', 60);
    expect(await kv.getdel('n')).toBe('x');
    expect(await kv.getdel('n')).toBeNull();
  });

  it('incr counts within a fixed window and resets after it', async () => {
    let now = 0;
    const kv = new MemoryKeyValueStore(() => now);
    expect(await kv.incr('rl', 60)).toEqual({ count: 1, ttlSec: 60 });
    now = 30_000;
    expect(await kv.incr('rl', 60)).toEqual({ count: 2, ttlSec: 30 });
    now = 60_000;
    expect(await kv.incr('rl', 60)).toEqual({ count: 1, ttlSec: 60 });
  });

  it('expires keys after their TTL', async () => {
    let now = 0;
    const kv = new MemoryKeyValueStore(() => now);
    await kv.set('n', 'x', 300);
    now = 299_000;
    expect(await kv.get('n')).toBe('x');
    now = 300_000;
    expect(await kv.get('n')).toBeNull();
  });
});
