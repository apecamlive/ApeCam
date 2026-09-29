import { describe, expect, it } from 'vitest';
import { runHealthChecks } from './health';

describe('runHealthChecks', () => {
  it('T-S0-U1 · all checks pass → ok', async () => {
    const report = await runHealthChecks({ db: async () => {}, redis: async () => {} });
    expect(report.ok).toBe(true);
    expect(report.checks.db?.ok).toBe(true);
    expect(report.checks.redis?.ok).toBe(true);
  });

  it('T-S0-U1 · one failing check → not ok, error reported', async () => {
    const report = await runHealthChecks({
      db: async () => {},
      redis: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    expect(report.ok).toBe(false);
    expect(report.checks.redis).toMatchObject({ ok: false, error: 'ECONNREFUSED' });
  });

  it('T-S0-U1 · hanging check times out', async () => {
    const report = await runHealthChecks({ db: () => new Promise(() => {}) }, 50);
    expect(report.ok).toBe(false);
    expect(report.checks.db?.error).toBe('timeout after 50ms');
  });
});
