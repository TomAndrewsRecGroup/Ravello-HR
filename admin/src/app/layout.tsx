import type { Metadata, Viewport } from 'next';
import ServiceWorkerRegistration from '@/components/pwa/ServiceWorkerRegistration';
import './globals.css';

// In-app logo / favicon source. Uses the Vercel blob URL — the same
// asset the sidebar, login, and other portal pages reference, which
// demonstrably works in production. The marketing-domain URL
// (www.thepeoplesystem.co.uk/email-logo.png) is reserved for email
// templates where Resend deliverability flags off-domain images;
// browsers don't have that constraint.
const LOGO = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/the%20people%20system%20%282%29.png';

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
