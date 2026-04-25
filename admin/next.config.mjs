import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizePackageImports: ['lucide-react'],
    // node-redis pulls in net/tls/string_decoder/crypto. Without this,
    // Next.js' server-action flight loader tries to bundle the package
    // for the client and the build fails. Keep it Node-side.
    serverComponentsExternalPackages: ['redis'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'haaqtnq6favvrbuh.public.blob.vercel-storage.com' },
    ],
  },
  // @shared/* path imports cross the project boundary into ../shared/. Without
  // this webpack alias, Next 14 resolves the TS path but webpack can't find
  // the modules at compile time.
  webpack: (config) => {
    config.resolve.alias['@shared'] = path.resolve(__dirname, '..', 'shared');
    return config;
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

export default nextConfig;
