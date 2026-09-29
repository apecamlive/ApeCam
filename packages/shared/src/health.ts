export type HealthCheck = () => Promise<void>;

export interface HealthReport {
  ok: boolean;
  checks: Record<string, { ok: boolean; ms: number; error?: string }>;
}

/**
 * Runs every check in parallel with a timeout. A missing dependency is reported as failed,
 * so Railway's health check keeps a broken deploy from receiving traffic.
 */
export async function runHealthChecks(
  checks: Record<string, HealthCheck>,
  timeoutMs = 3000,
): Promise<HealthReport> {
  const entries = await Promise.all(
    Object.entries(checks).map(async ([name, check]) => {
      const started = performance.now();
      try {
        await withTimeout(check(), timeoutMs);
        return [name, { ok: true, ms: Math.round(performance.now() - started) }] as const;
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return [name, { ok: false, ms: Math.round(performance.now() - started), error }] as const;
      }
    }),
  );
  const result: HealthReport['checks'] = Object.fromEntries(entries);
  return { ok: Object.values(result).every((c) => c.ok), checks: result };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
