import type { Metadata, Viewport } from 'next';
import ServiceWorkerRegistration from '@/components/pwa/ServiceWorkerRegistration';
import './globals.css';

// Logo hosted on the marketing domain — same image the email
// templates use. Keeping it on a TPS-controlled host avoids the
// off-domain warnings that flagged the earlier Vercel blob URL.
const LOGO = 'https://www.thepeoplesystem.co.uk/email-logo.png';

export const metadata: Metadata = {
  title: { default: 'The People System Admin', template: '%s | TPS Admin' },
  description: 'Internal People System administration panel.',
  robots: { index: false, follow: false },
  manifest: '/manifest.json',
  // Drives <link rel="icon"> + <link rel="apple-touch-icon"> in the
  // rendered <head>. Next.js 14 metadata API replaces the manual
  // <link> tags we used to inject in the layout JSX.
  icons: {
    icon:    [{ url: LOGO, type: 'image/png' }],
    shortcut: LOGO,
    apple:    [{ url: LOGO }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'TPS Admin',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#7C3AED',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
