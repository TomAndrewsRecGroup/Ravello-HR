import type { Metadata } from 'next';
import { Oswald, Inter } from 'next/font/google';
import { IrisShader } from '@/components/a2i/IrisShader';
import { SmokeCanvas } from '@/components/a2i/SmokeCanvas';
import '@/components/a2i/a2i-theme.css';

// Athletes To Industry display + body fonts, scoped to the /r subtree via
// CSS variables on the wrapper. The portal's global Inter link is unaffected.
const oswald = Oswald({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-a2i-oswald',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-a2i-inter',
  display: 'swap',
});

const ATI_LOGO =
  'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/Athletes%20To%20Industry%20Option%20A.png';

// Public referral links should never be indexed.
export const metadata: Metadata = {
  title: 'Athletes To Industry',
  robots: { index: false, follow: false },
};

export default function ReferralLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`a2i-scope ${oswald.variable} ${inter.variable}`}>
      {/* Background layers (fixed, behind content) */}
      <div aria-hidden className="a2i-bg-solid" />
      <div aria-hidden className="a2i-bg-shader">
        <IrisShader />
      </div>
      <SmokeCanvas />

      {/* Brand header */}
      <header className="relative z-10 flex items-center justify-center px-6 pt-10 pb-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ATI_LOGO}
          alt="Athletes To Industry"
          width={120}
          height={120}
          style={{ height: 'auto', width: 96, objectFit: 'contain' }}
        />
      </header>

      <main className="relative z-10">{children}</main>

      <footer className="relative z-10 px-6 py-10 text-center">
        <p className="a2i-prose" style={{ fontSize: 12, opacity: 0.7 }}>
          Athletes To Industry. Operated by Andrews Recruitment Group, powered by The People System.
        </p>
      </footer>
    </div>
  );
}
