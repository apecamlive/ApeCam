import type { Instrumentation } from 'next';

export function register() {
  // Nothing to set up yet. An error tracker (e.g. Sentry) would be initialised here; see docs/runbooks.
}

/**
 * Every uncaught server error (render, route handler, server action) as one JSON log line, so Railway log
 * search can find it by digest (the reference number the error page shows users).
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const e = err as Error & { digest?: string };
  console.error(
    JSON.stringify({
      level: 'error',
      msg: 'request error',
      digest: e.digest,
      err: e.stack ?? String(err),
      method: request.method,
      path: request.path,
      routePath: context.routePath,
      routeType: context.routeType,
      time: new Date().toISOString(),
    }),
  );
};
