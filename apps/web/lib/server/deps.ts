import { coreDepsFromEnv, type CoreDeps } from '@apecam/core';
import { consoleLogger } from '@apecam/core';
import { MemoryKeyValueStore, RedisKeyValueStore, type KeyValueStore } from '@apecam/shared';
import { Redis } from 'ioredis';
import type { AuthConfig } from './auth';
import { loadSessionKeys, type SessionKeys } from './session';

export interface WebDeps extends CoreDeps {
  kv: KeyValueStore;
  auth: AuthConfig;
  keys: SessionKeys;
  secureCookies: boolean;
}

export async function buildDeps(env: Record<string, string | undefined>): Promise<WebDeps> {
  const kv: KeyValueStore = env.REDIS_URL
    ? new RedisKeyValueStore(new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, family: 0 }))
    : new MemoryKeyValueStore();
  if (!env.REDIS_URL)
    consoleLogger.warn({}, 'REDIS_URL not set: using in-memory store (single process only)');

  const origin = env.APP_ORIGIN ?? 'http://localhost:3000';
  return {
    ...coreDepsFromEnv(env, kv),
    kv,
    auth: { origin, domain: new URL(origin).host, evmChainIds: [4663, 8453, 56, 1] },
    keys: await loadSessionKeys(env),
    secureCookies: origin.startsWith('https://'),
  };
}

let current: Promise<WebDeps> | undefined;

export function getDeps(): Promise<WebDeps> {
  current ??= buildDeps(process.env);
  return current;
}

/** Tests inject fakes here. */
export function setDeps(deps: WebDeps | undefined) {
  current = deps ? Promise.resolve(deps) : undefined;
}
