import { sitemapTokens } from '@apecam/core';
import type { MetadataRoute } from 'next';
import { getDeps } from '@/lib/server/deps';
import { siteOrigin } from '@/lib/site';

// Built per request (the CDN caches it), so it needs the database at runtime, not at build time.
export const dynamic = 'force-dynamic';

const STATIC = ['/', '/search', '/burn', '/about', '/rules', '/terms', '/privacy'];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  const pages: MetadataRoute.Sitemap = STATIC.map((p) => ({
    url: `${origin}${p}`,
    changeFrequency: p === '/' ? 'always' : 'weekly',
  }));
  try {
    for (const r of await sitemapTokens(await getDeps())) {
      pages.push({
        url: `${origin}/t/${r.chain}/${r.contract}`,
        lastModified: r.lastStreamAt ?? undefined,
        changeFrequency: 'hourly',
      });
    }
  } catch {
    // Database unreachable: still serve the static pages.
  }
  return pages;
}
