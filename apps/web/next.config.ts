import type { NextConfig } from 'next';

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
};

export default nextConfig;
