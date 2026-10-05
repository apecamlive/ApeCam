import { test as base, expect, type APIRequestContext } from '@playwright/test';
import { keccak256, toHex, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';

export const E2E_PORT = 3100;
export const E2E_ORIGIN = `http://localhost:${E2E_PORT}`;
/** Test-only key, derived from a fixed string; its address is seeded as admin in the E2E database. */
export const ADMIN_KEY: Hex = keccak256(toHex('apecam-e2e-admin'));
export const ADMIN_ADDRESS = privateKeyToAccount(ADMIN_KEY).address.toLowerCase();

export const SEED = {
  apex: '/t/base/0x00000000000000000000000000000000000e2e01',
  moon: '/t/base/0x00000000000000000000000000000000000e2e02',
};

const randomIp = () => `10.${rand()}.${rand()}.${rand()}`;
const rand = () => Math.floor(Math.random() * 256);

/**
 * Signs in through the real API (nonce → SIWE message signed by a local key → verify). Wallet extensions
 * cannot be driven by Playwright, so the "connect wallet" popup itself is the one step not covered here.
 * The session cookie lands in the browser context shared with `request`.
 */
export async function signIn(request: APIRequestContext, key: Hex = generatePrivateKey()) {
  const account = privateKeyToAccount(key);
  const headers = { origin: E2E_ORIGIN };
  const n = await (await request.post('/api/auth/nonce', { headers })).json();
  const message = createSiweMessage({
    address: account.address,
    chainId: 8453,
    domain: new URL(E2E_ORIGIN).host,
    uri: E2E_ORIGIN,
    version: '1',
    nonce: n.nonce,
    issuedAt: new Date(n.issuedAt),
    expirationTime: new Date(n.expirationTime),
    statement: n.statement,
  });
  const res = await request.post('/api/auth/verify', {
    headers,
    data: { family: 'evm', message, signature: await account.signMessage({ message }) },
  });
  expect(res.status(), await res.text()).toBe(200);
  return { address: account.address.toLowerCase(), ...(await res.json()) };
}

/**
 * Each test looks like a different client IP, so the app's per-IP rate limits (which are real in this
 * production build) do not leak between tests.
 */
export const test = base.extend({
  // Playwright requires an object pattern as the first fixture argument, even when it is unused.
  // eslint-disable-next-line no-empty-pattern
  extraHTTPHeaders: async ({}, use) => {
    await use({ 'x-forwarded-for': randomIp() });
  },
});

export { expect };
