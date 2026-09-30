import { kvKeys, type KeyValueStore } from '@apecam/shared';
import {
  exportJWK,
  generateKeyPair,
  importJWK,
  importPKCS8,
  jwtVerify,
  SignJWT,
  type CryptoKey,
  type JWK,
} from 'jose';

export const SESSION_COOKIE = 'apecam_session';
const SESSION_TTL_SEC = 7 * 24 * 60 * 60;
const ISSUER = 'apecam';

export interface Session {
  userId: string;
  sid: string;
  role: 'user' | 'moderator' | 'admin';
}

export interface SessionKeys {
  kid: string;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicJwk: JWK;
}

/**
 * ES256 keys for session JWTs. The public key is also published at /.well-known/jwks.json so Privy
 * can verify our users for embedded wallets (Implementation Plan §4.10).
 * Local dev without a configured key gets an ephemeral one (sessions reset on restart).
 */
export async function loadSessionKeys(env: Record<string, string | undefined>): Promise<SessionKeys> {
  const pem = env.SESSION_JWT_PRIVATE_KEY?.replace(/\\n/g, '\n');
  let privateKey: CryptoKey;
  if (pem) {
    privateKey = await importPKCS8(pem, 'ES256', { extractable: true });
  } else {
    if (env.NODE_ENV === 'production') throw new Error('SESSION_JWT_PRIVATE_KEY is required in production');
    ({ privateKey } = await generateKeyPair('ES256', { extractable: true }));
  }
  const { d: _private, ...jwk } = await exportJWK(privateKey);
  const kid = env.SESSION_JWT_KID ?? 'dev';
  const publicJwk: JWK = { ...jwk, kid, alg: 'ES256', use: 'sig' };
  const publicKey = (await importJWK(publicJwk, 'ES256')) as CryptoKey;
  return { kid, privateKey, publicKey, publicJwk };
}

export async function createSessionToken(keys: SessionKeys, session: Session) {
  return new SignJWT({ sid: session.sid, role: session.role })
    .setProtectedHeader({ alg: 'ES256', kid: keys.kid })
    .setSubject(session.userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SEC}s`)
    .sign(keys.privateKey);
}

export async function readSessionToken(
  keys: SessionKeys,
  kv: KeyValueStore,
  token: string,
): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, keys.publicKey, { issuer: ISSUER, algorithms: ['ES256'] });
    const sid = payload.sid as string | undefined;
    if (!payload.sub || !sid) return null;
    if (await kv.get(revokedKey(sid))) return null;
    // A ban invalidates every session issued before it (core `banWallet` writes this key).
    const validAfter = await kv.get(kvKeys.sessionsValidAfter(payload.sub));
    if (validAfter && (payload.iat ?? 0) * 1000 <= Number(validAfter)) return null;
    return { userId: payload.sub, sid, role: (payload.role as Session['role']) ?? 'user' };
  } catch {
    return null;
  }
}

export async function revokeSession(kv: KeyValueStore, sid: string) {
  await kv.set(revokedKey(sid), '1', SESSION_TTL_SEC);
}

const revokedKey = (sid: string) => `session-revoked:${sid}`;

function cookie(value: string, maxAge: number, secure: boolean) {
  const parts = [`${SESSION_COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export const sessionCookie = (token: string, secure: boolean) => cookie(token, SESSION_TTL_SEC, secure);
export const clearSessionCookie = (secure: boolean) => cookie('', 0, secure);

export function readCookie(req: Request, name: string) {
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}
