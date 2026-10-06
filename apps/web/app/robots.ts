import type { MetadataRoute } from 'next';
import { siteOrigin } from '@/lib/site';

// Read APP_ORIGIN at request time, not at build time (the domain may be set after the first build).
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/api/', '/dev', '/go-live'] }],
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
