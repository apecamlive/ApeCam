import { createTestContext } from '@apecam/core/testing';
import { buildSiwsMessage } from '@apecam/shared';
import { ed25519 } from '@noble/curves/ed25519.js';
import bs58 from 'bs58';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';
import { setDeps, type WebDeps } from '@/lib/server/deps';
import { loadSessionKeys } from '@/lib/server/session';

export const ORIGIN = 'http://localhost:3000';

/** Web deps on top of the core test context (PGlite + fake chain/prices/LiveKit), installed for route handlers. */
export async function createWebTestContext() {
  const core = await createTestContext();
  const kv = core.kv;
  const deps: WebDeps = {
    ...core.deps,
    kv,
    auth: { origin: ORIGIN, domain: 'localhost:3000', evmChainIds: [4663, 8453, 56, 1] },
    keys: await loadSessionKeys({}),
    secureCookies: false,
  };
  setDeps(deps);
  return { ...core, deps, kv };
}

type RouteHandler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

export async function call(
  handler: RouteHandler,
  opts: {
    method?: string;
    body?: unknown;
    cookie?: string;
    params?: Record<string, string>;
    origin?: string | null;
    headers?: Record<string, string>;
    rawBody?: string;
  } = {},
) {
  // A fresh client IP per call keeps per-IP rate limits out of unrelated tests; rate-limit tests pin one.
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-forwarded-for': `10.0.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`,
    ...opts.headers,
  };
  if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
  if (opts.cookie) headers.cookie = opts.cookie;
  const req = new Request(`${ORIGIN}/api/test`, {
    method: opts.method ?? 'POST',
    headers,
    body: opts.rawBody ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
  });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
  // Tests read nested response fields freely; the handlers themselves are typed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json()) as Record<string, any>;
  const setCookie = res.headers.get('set-cookie');
  return { status: res.status, json, cookie: setCookie?.split(';')[0], headers: res.headers };
}

export function evmSigner() {
  const account = privateKeyToAccount(generatePrivateKey());
  return {
    family: 'evm' as const,
    address: account.address,
    async sign(
      n: { nonce: string; issuedAt: string; expirationTime: string; statement: string },
      over: Partial<{ domain: string; chainId: number }> = {},
    ) {
      const message = createSiweMessage({
        address: account.address,
        chainId: over.chainId ?? 8453,
        domain: over.domain ?? 'localhost:3000',
        uri: ORIGIN,
        version: '1',
        nonce: n.nonce,
        issuedAt: new Date(n.issuedAt),
        expirationTime: new Date(n.expirationTime),
        statement: n.statement,
      });
      return { family: 'evm' as const, message, signature: await account.signMessage({ message }) };
    },
  };
}

export function solanaSigner() {
  const secret = ed25519.utils.randomSecretKey();
  const address = bs58.encode(ed25519.getPublicKey(secret));
  return {
    family: 'solana' as const,
    address,
    async sign(
      n: { nonce: string; issuedAt: string; expirationTime: string; statement: string },
      over: Partial<{ domain: string }> = {},
    ) {
      const message = buildSiwsMessage({
        domain: over.domain ?? 'localhost:3000',
        address,
        statement: n.statement,
        uri: ORIGIN,
        version: '1',
        chainId: 'mainnet',
        nonce: n.nonce,
        issuedAt: n.issuedAt,
        expirationTime: n.expirationTime,
      });
      const signature = bs58.encode(ed25519.sign(new TextEncoder().encode(message), secret));
      return { family: 'solana' as const, message, signature };
    },
  };
}
