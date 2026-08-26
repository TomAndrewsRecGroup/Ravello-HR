import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'haaqtnq6favvrbuh.public.blob.vercel-storage.com' },
    ],
  },
  experimental: {
    // Required on Next 14 for instrumentation.ts (Sentry boot).
    instrumentationHook: true,
    // Tree-shake lucide-react icons — only bundle icons actually imported
    optimizePackageImports: ['lucide-react'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

// Sentry wraps the config to upload source maps and instrument the
// server. Without SENTRY_AUTH_TOKEN the upload step is skipped and the
// build behaves exactly as it did before, so local and preview builds
// are unaffected.
export default withSentryConfig(nextConfig, {
  org:     process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent:  !process.env.CI,

  // Source maps are uploaded then deleted from the deployed bundle, so
  // stack traces are readable in Sentry without shipping our source to
  // anyone who opens devtools.
  widenClientFileUpload: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },

  // Routes Sentry's own browser requests through our domain so ad
  // blockers do not silently swallow error reports.
  tunnelRoute: '/monitoring',

  disableLogger: true,
  automaticVercelMonitors: true,
});
