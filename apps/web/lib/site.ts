/** Public origin for absolute URLs (sitemap, OG). Same variable the auth messages use. */
export function siteOrigin() {
  return (process.env.APP_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '');
}
