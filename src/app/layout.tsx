import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Analytics } from '@/components/Analytics';
import { ClarityScript } from '@/components/ClarityScript';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import ChatWidget from '@/components/ChatWidget';
import QuickActions from '@/components/QuickActions';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: {
    default: 'Ravello HR | Hire. Lead. Protect.',
    template: '%s | Ravello HR',
  },
  description:
    'Ravello HR helps ambitious businesses fix hiring, protect compliance and navigate transformation — with a named system, not generic advice.',
  keywords: [
    'HR consultancy UK',
    'Smart Hiring System',
    'HR compliance',
    'people strategy',
    'M&A HR support',
    'PolicySafe',
    'recruitment turnaround',
  ],
  authors: [{ name: 'Lucinda Reader', url: 'https://ravellohr.co.uk' }],
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    url: 'https://ravellohr.co.uk',
    siteName: 'Ravello HR',
    title: 'Ravello HR | Hire. Lead. Protect.',
    description:
      'Fix hiring. Build compliance. Navigate change. Ravello HR delivers named HR systems — not generic consultancy.',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ravello HR',
    description: 'Strategic HR systems for ambitious businesses.',
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
    <html lang="en" className={inter.variable}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <ClarityScript />
      </head>
      <body className="bg-brand-void font-sans antialiased">
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
