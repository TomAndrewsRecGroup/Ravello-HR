import type { Metadata } from 'next';
import './globals.css';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: {
    default:  'Ravello HR — HR Diagnostics, Strategy & Project Delivery',
    template: '%s | Ravello HR',
  },
  description: 'Ravello HR is a UK HR consultancy offering diagnostic tools, strategic HR delivery, and people project management for growing businesses.',
  metadataBase: new URL('https://ravellohr.co.uk'),
  openGraph: {
    type:      'website',
    locale:    'en_GB',
    url:       'https://ravellohr.co.uk',
    siteName:  'Ravello HR',
    images: [{
      url:    '/og-default.png',
      width:  1200,
      height: 630,
      alt:    'Ravello HR — HR Diagnostics, Strategy & Project Delivery',
    }],
  },
  twitter: {
    card:  'summary_large_image',
    title: 'Ravello HR — HR Diagnostics, Strategy & Project Delivery',
  },
  robots: {
    index:  true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Nav />
        <main style={{ paddingTop: '68px' }}>
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
