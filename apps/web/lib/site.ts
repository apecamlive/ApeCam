/**
 * The public origin users load (scheme + host + port), from APP_ORIGIN. Normalised so a pasted value with a
 * trailing slash, a path or surrounding spaces still matches the browser's Origin header exactly
 * (sign-in messages and CSRF checks compare against it).
 */
export function normalizeOrigin(raw: string | undefined, fallback = 'http://localhost:3000') {
  const value = raw?.trim().replace(/^["']|["']$/g, '');
  if (!value) return fallback;
  try {
    return new URL(value).origin;
  } catch {
    // Missing scheme ("apecam.xyz"): assume https.
    try {
      return new URL(`https://${value}`).origin;
    } catch {
      return fallback;
    }
  }
}

/** Public origin for absolute URLs (sitemap, OG) and auth. */
export function siteOrigin() {
  return normalizeOrigin(process.env.APP_ORIGIN);
}
