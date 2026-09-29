import { describe, expect, it } from 'vitest';
import { MemoryKeyValueStore } from './kv';

describe('MemoryKeyValueStore', () => {
  it('getdel returns the value once', async () => {
    const kv = new MemoryKeyValueStore();
    await kv.set('n', 'x', 60);
    expect(await kv.getdel('n')).toBe('x');
    expect(await kv.getdel('n')).toBeNull();
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
