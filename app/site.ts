// Vercel injects VERCEL_PROJECT_PRODUCTION_URL (host only, no scheme) into builds and
// runtime, so a custom domain is picked up automatically. NEXT_PUBLIC_SITE_URL overrides it.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");
