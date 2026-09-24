import type { Metadata, Viewport } from 'next';
import ServiceWorkerRegistration from '@/components/pwa/ServiceWorkerRegistration';
import './globals.css';
import { BRAND_NAME } from '@/lib/brand';

// Favicons and home-screen icons are the Core OS 360 mark, generated into
// public/brand/ (see lib/brand.ts). Served from our own origin, so no
// third-party image host sits between a page and its favicon.

export const metadata: Metadata = {
  title: { default: 'Core OS 360', template: '%s | Core OS 360' },
  description: 'Your Core OS 360 workspace: hiring, HR, documents, and support.',
  applicationName: BRAND_NAME,
  robots: { index: false, follow: false },
  manifest: '/manifest.json',
  // Drives <link rel="icon"> + <link rel="apple-touch-icon"> in the
  // rendered <head>. Next.js 14 metadata API replaces the manual
  // <link> tags we used to inject in the layout JSX.
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/brand/favicon-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/brand/favicon-16.png', type: 'image/png', sizes: '16x16' },
      { url: '/brand/core-os-360-mark-simple.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/favicon.ico',
    apple:    [{ url: '/brand/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Core OS 360',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#070B20',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Pair the deprecated apple-* meta (auto-emitted by Next's
            metadata.appleWebApp) with the modern mobile-web-app-capable
            tag so Chrome stops logging the deprecation warning. */}
        <meta name="mobile-web-app-capable" content="yes" />
        {/* Fonts are self-hosted via @font-face in globals.css — no Google Fonts. */}
        <link rel="preload" href="/fonts/inter-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
