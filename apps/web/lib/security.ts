/**
 * Security headers and the Cloudflare origin lock (S4-6). Pure functions so they are unit-tested and shared
 * by next.config (headers on every response) and proxy.ts (origin check).
 */

export interface HeaderOptions {
  dev: boolean;
  /** Served over HTTPS (APP_ORIGIN): enables HSTS and upgrade-insecure-requests. Off for http://localhost QA. */
  https: boolean;
}

export function contentSecurityPolicy(opts: HeaderOptions) {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // Next.js injects inline bootstrap scripts; nonces would force every page to render dynamically.
    // XSS is handled by React escaping + the dangerouslySetInnerHTML lint ban.
    'script-src': ["'self'", "'unsafe-inline'", ...(opts.dev ? ["'unsafe-eval'"] : [])],
    'style-src': ["'self'", "'unsafe-inline'"],
    // Token logos come from DexScreener/CoinGecko CDNs and arbitrary token metadata hosts.
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'font-src': ["'self'", 'data:'],
    // Wallet RPCs, WalletConnect relay, LiveKit signalling (wss) and media servers.
    'connect-src': ["'self'", 'https:', 'wss:', ...(opts.dev ? ['ws:', 'http://localhost:*'] : [])],
    'media-src': ["'self'", 'blob:', 'https:'],
    'frame-src': ['https://verify.walletconnect.com', 'https://verify.walletconnect.org'],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  if (opts.https) directives['upgrade-insecure-requests'] = [];
  return Object.entries(directives)
    .map(([k, v]) => (v.length ? `${k} ${v.join(' ')}` : k))
    .join('; ');
}

export function securityHeaders(opts: HeaderOptions): { key: string; value: string }[] {
  const headers = [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy(opts) },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // Only this origin may use the camera/mic/screen (Go Live studio); nothing else is needed.
    {
      key: 'Permissions-Policy',
      value: 'camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=(), usb=()',
    },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  ];
  if (opts.https) {
    headers.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' });
  }
  return headers;
}

/** Header Cloudflare adds (Transform Rule) so the Railway origin rejects traffic that bypassed Cloudflare. */
export const ORIGIN_SECRET_HEADER = 'x-apecam-origin';

/** Paths reachable without Cloudflare: Railway's health check hits the origin directly. */
const ORIGIN_EXEMPT = ['/api/health'];

export function originAllowed(pathname: string, header: string | null, secret: string | undefined) {
  if (!secret) return true; // not configured (local dev, preview deploys)
  if (ORIGIN_EXEMPT.includes(pathname)) return true;
  return header !== null && timingSafeEqual(header, secret);
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
