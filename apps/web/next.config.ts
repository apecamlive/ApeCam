import type { NextConfig } from 'next';
import { securityHeaders } from './lib/security';
import { normalizeOrigin } from './lib/site';

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: [
    '@apecam/shared',
    '@apecam/chain',
    '@apecam/core',
    '@apecam/db',
    '@apecam/pricing',
    '@apecam/storage',
  ],
  // Loaded from node_modules at runtime instead of bundled. @base-org/account (RainbowKit -> wagmi Base
  // Account connector) has optional x402 imports that are never installed or used; bundling it for SSR fails.
  serverExternalPackages: [
    '@electric-sql/pglite',
    'pg',
    'livekit-server-sdk',
    '@base-org/account',
    '@coinbase/cdp-sdk',
  ],
  poweredByHeader: false,
  async headers() {
    // Evaluated at build time: APP_ORIGIN must be set for the build (Railway exposes service variables to it).
    const headers = securityHeaders({
      dev: process.env.NODE_ENV !== 'production',
      https: normalizeOrigin(process.env.APP_ORIGIN).startsWith('https://'),
    });
    return [{ source: '/:path*', headers }];
  },
};

export default nextConfig;
