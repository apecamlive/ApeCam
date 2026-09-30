import { consoleLogger } from '@apecam/core';
import { users } from '@apecam/db';
import { ApiError } from '@apecam/shared';
import { eq } from 'drizzle-orm';
import { z, ZodError, type ZodType } from 'zod';
import { getDeps, type WebDeps } from './deps';
import { readCookie, readSessionToken, SESSION_COOKIE, type Session } from './session';

export type RouteContext = { params: Promise<Record<string, string>> };
type Handler = (req: Request, ctx: RouteContext, deps: WebDeps) => Promise<unknown>;

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function errorResponse(err: unknown, deps?: WebDeps) {
  if (err instanceof ApiError) {
    const retryAfter = err.status === 429 ? err.details?.retryAfterSec : undefined;
    return Response.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status, headers: retryAfter ? { 'retry-after': String(retryAfter) } : undefined },
    );
  }
  if (err instanceof ZodError) {
    return Response.json(
      { error: { code: 'VALIDATION', message: 'Invalid request', details: { issues: z.treeifyError(err) } } },
      { status: 400 },
    );
  }
  // deps is undefined when building them failed (e.g. missing env), so fall back to console.
  const log = deps?.log ?? consoleLogger;
  log.error({ err: err instanceof Error ? err.stack : String(err) }, 'unhandled route error');
  return Response.json({ error: { code: 'INTERNAL', message: 'Something went wrong' } }, { status: 500 });
}

export interface RateLimit {
  /** Bucket name, e.g. 'auth', 'reports'. */
  name: string;
  limit: number;
  windowSec: number;
  /** 'ip' for anonymous endpoints; 'user' falls back to the IP when signed out. */
  by: 'ip' | 'user';
}

/**
 * Client IP for rate limiting. Behind Cloudflare (enforced by CF_ORIGIN_SECRET) CF-Connecting-IP is set by
 * Cloudflare and cannot be forged. Otherwise use the LAST X-Forwarded-For hop, the one Railway's proxy
 * appended: earlier hops are whatever the client sent.
 */
export function clientIp(req: Request) {
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf;
  const hops = req.headers
    .get('x-forwarded-for')
    ?.split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  return hops?.at(-1) ?? req.headers.get('x-real-ip') ?? 'unknown';
}

async function enforceRateLimit(req: Request, deps: WebDeps, rl: RateLimit) {
  let who = `ip:${clientIp(req)}`;
  if (rl.by === 'user') {
    const session = await getSession(req, deps);
    if (session) who = `user:${session.userId}`;
  }
  const { count, ttlSec } = await deps.kv.incr(`rl:${rl.name}:${who}`, rl.windowSec);
  if (count > rl.limit) {
    throw new ApiError(429, 'RATE_LIMITED', 'Too many requests, slow down', { retryAfterSec: ttlSec });
  }
}

/** Per-endpoint limits (Implementation Plan §6). */
export const LIMITS = {
  auth: { name: 'auth', limit: 10, windowSec: 60, by: 'ip' },
  search: { name: 'search', limit: 60, windowSec: 60, by: 'ip' },
  viewToken: { name: 'view-token', limit: 30, windowSec: 60, by: 'ip' },
  eligibility: { name: 'eligibility', limit: 20, windowSec: 60, by: 'user' },
  start: { name: 'start', limit: 5, windowSec: 60, by: 'user' },
  myTokens: { name: 'my-tokens', limit: 30, windowSec: 60, by: 'user' },
  reports: { name: 'reports', limit: 5, windowSec: 3600, by: 'user' },
  profile: { name: 'profile', limit: 10, windowSec: 3600, by: 'user' },
  wallets: { name: 'wallets', limit: 10, windowSec: 3600, by: 'user' },
  embedded: { name: 'embedded', limit: 5, windowSec: 3600, by: 'user' },
  /**
   * Generous ceiling for everything else so a single client cannot hammer the API. Per user when signed in:
   * many real viewers can share one carrier-NAT IP on mobile networks.
   */
  default: { name: 'default', limit: 600, windowSec: 60, by: 'user' },
} satisfies Record<string, RateLimit>;

/**
 * Wraps a route handler: rate limit, CSRF origin check on writes, JSON responses, and one error format
 * `{ error: { code, message, details } }` for every endpoint (Implementation Plan §6).
 */
export function route(
  handler: Handler,
  opts: { skipOriginCheck?: boolean; rateLimit?: RateLimit | false } = {},
) {
  return async (req: Request, ctx: RouteContext) => {
    let deps: WebDeps | undefined;
    try {
      deps = await getDeps();
      if (opts.rateLimit !== false) await enforceRateLimit(req, deps, opts.rateLimit ?? LIMITS.default);
      if (MUTATING.has(req.method) && !opts.skipOriginCheck) {
        const origin = req.headers.get('origin');
        if (origin !== deps.auth.origin)
          throw new ApiError(403, 'BAD_ORIGIN', 'Cross-origin request rejected');
      }
      const out = await handler(req, ctx, deps);
      return out instanceof Response ? out : Response.json(out);
    } catch (err) {
      return errorResponse(err, deps);
    }
  };
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new ApiError(400, 'VALIDATION', 'Body must be JSON');
  }
  return schema.parse(json);
}

export async function getSession(req: Request, deps: WebDeps): Promise<Session | null> {
  const token = readCookie(req, SESSION_COOKIE);
  return token ? readSessionToken(deps.keys, deps.kv, token) : null;
}

/** Signed-in, not banned. Ban state is read from the database on every write, never from the JWT. */
export async function requireSession(req: Request, deps: WebDeps): Promise<Session> {
  const session = await getSession(req, deps);
  if (!session) throw new ApiError(401, 'UNAUTHENTICATED', 'Connect your wallet and sign in');
  const [user] = await deps.db
    .select({ bannedUntil: users.bannedUntil, role: users.role })
    .from(users)
    .where(eq(users.id, session.userId));
  if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in again');
  const now = deps.now?.() ?? new Date();
  if (user.bannedUntil && user.bannedUntil > now)
    throw new ApiError(403, 'USER_BANNED', 'This account is banned');
  // The role is read from the database so promotions/demotions apply immediately, not at next login.
  return { ...session, role: user.role };
}

const RANK = { user: 0, moderator: 1, admin: 2 } as const;

/** Moderator panel guard (S2-4). Admin-only actions pass `'admin'`. */
export async function requireStaff(
  req: Request,
  deps: WebDeps,
  min: 'moderator' | 'admin' = 'moderator',
): Promise<Session> {
  const session = await requireSession(req, deps);
  if (RANK[session.role] < RANK[min]) throw new ApiError(403, 'FORBIDDEN', 'Moderators only');
  return session;
}
