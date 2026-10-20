// Absolute base for canonical/hreflang/sitemap URLs.
// VERCEL_PROJECT_PRODUCTION_URL is set by Vercel on every deployment (the
// production domain, no scheme); locally there's none, so URLs point at the
// dev server.
export const SITE_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";
