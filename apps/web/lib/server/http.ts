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
    return Response.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status },
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

/**
 * Wraps a route handler: CSRF origin check on writes, JSON responses, and one error format
 * `{ error: { code, message, details } }` for every endpoint (Implementation Plan §6).
 */
export function route(handler: Handler, opts: { skipOriginCheck?: boolean } = {}) {
  return async (req: Request, ctx: RouteContext) => {
    let deps: WebDeps | undefined;
    try {
      deps = await getDeps();
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
    .select({ bannedUntil: users.bannedUntil })
    .from(users)
    .where(eq(users.id, session.userId));
  if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in again');
  const now = deps.now?.() ?? new Date();
  if (user.bannedUntil && user.bannedUntil > now)
    throw new ApiError(403, 'USER_BANNED', 'This account is banned');
  return session;
}
