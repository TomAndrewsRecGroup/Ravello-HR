import type { Metadata } from 'next';
import { DM_Sans, Cormorant_Garamond } from 'next/font/google';
import './globals.css';
import { Analytics } from '@/components/Analytics';
import { ClarityScript } from '@/components/ClarityScript';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import ChatWidget from '@/components/ChatWidget';
import QuickActions from '@/components/QuickActions';
import ExitIntentPopup from '@/components/ExitIntentPopup';
import CalendlyWidget from '@/components/CalendlyWidget';
import SocialProofTicker from '@/components/SocialProofTicker';

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://ravellohr.co.uk'),
  title: {
    default: 'The People System | Hire. Lead. Protect.',
    template: '%s',
  },
  description:
    'The People System helps ambitious businesses fix hiring, build HR foundations, and lead their people function — one partner, total control.',
  keywords: ['HR consultancy UK', 'fractional HR', 'embedded recruitment', 'Friction Lens', 'HR compliance', 'people strategy', 'Employment Rights Bill', 'M&A HR support'],
  authors: [{ name: 'The People System', url: 'https://ravellohr.co.uk' }],
  openGraph: {
    type: 'website', locale: 'en_GB', url: 'https://ravellohr.co.uk', siteName: 'The People System',
    title: 'The People System | Hire. Lead. Protect.',
    description: 'One partner. Total control of your people function. HIRE, LEAD, and PROTECT — delivered by Lucy and Tom.',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image', title: 'The People System',
    description: 'Hire. Lead. Protect. One partner. Total control of your people function.',
    images: ['/og-image.png'],
  },
  robots: { index: true, follow: true },
  alternates: { canonical: 'https://ravellohr.co.uk' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${cormorant.variable}`}>
      <head><ClarityScript /></head>
      <body className="font-sans antialiased" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
        <Analytics />
        <Nav />
        <main>{children}</main>
        <SocialProofTicker />
        <Footer />
        <QuickActions />
        <CalendlyWidget />
        <ExitIntentPopup />
        <ChatWidget />
      </body>
    </html>
  );
}
