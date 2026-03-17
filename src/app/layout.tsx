import type { Metadata } from 'next';
import './globals.css';
import { Analytics }    from '@/components/Analytics';
import { ClarityScript } from '@/components/ClarityScript';
import Nav              from '@/components/Nav';
import Footer           from '@/components/Footer';
import ChatWidget       from '@/components/ChatWidget';
import QuickActions     from '@/components/QuickActions';

export const metadata: Metadata = {
  title: {
    default: 'Ravello | HR & Hiring for Growing Businesses',
    template: '%s | Ravello',
  },
  description:
    'Ravello gives SMEs of 10–250 people the HR support, structured hiring, and operational visibility they need — without building an in-house HR team. Expert support, vetted recruiter network, client portal.',
  keywords: [
    'HR support for SMEs',
    'outsourced HR UK',
    'HR and recruitment platform',
    'small business HR',
    'hiring support UK',
    'HR portal for businesses',
    'vetted recruiters UK',
    'people operations platform',
  ],
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    url: 'https://ravellohr.co.uk',
    siteName: 'Ravello',
    title: 'Ravello | HR & Hiring for Growing Businesses',
    description:
      'HR support, structured hiring, and a client portal for businesses of 10–250 people.',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ravello | HR & Hiring for Growing Businesses',
    description: 'HR support, hiring, and visibility for growing businesses.',
    images: ['/og-image.png'],
  },
  robots: { index: true, follow: true },
  alternates: { canonical: 'https://ravellohr.co.uk' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Inter:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
        <ClarityScript />
      </head>
      <body>
        <Analytics />
        <Nav />
        <main>{children}</main>
        <Footer />
        <QuickActions />
        <ChatWidget />
      </body>
    </html>
  );
}
