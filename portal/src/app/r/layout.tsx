import type { Metadata } from 'next';
import { IrisShaderLazy } from '@/components/a2i/IrisShaderLazy';
import '@/components/a2i/a2i-theme.css';

// Athletes To Industry display + body fonts. These used next/font/google,
// which downloads from Google Fonts DURING THE BUILD — and on 2026-09-24 a
// bad response from Google failed the portal build outright. Both fonts are
// now self-hosted (@font-face in globals.css); a2i-theme.css maps the
// --font-a2i-* variables onto them, so nothing below needs a class.

const ATI_LOGO =
  'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/Athletes%20To%20Industry%20Option%20A.png';

// Public referral links should never be indexed.
export const metadata: Metadata = {
  title: 'Athletes To Industry',
  robots: { index: false, follow: false },
};

export default function ReferralLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="a2i-scope">
      {/* Background layers — mirror the Athletes To Industry site:
          solid navy fill, then the WebGL iris shader on top. No smoke. */}
      <div aria-hidden className="a2i-bg-solid" />
      <div aria-hidden className="a2i-bg-shader">
        <IrisShaderLazy />
      </div>

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
          Athletes To Industry. Operated by Andrews Recruitment Group, powered by Core OS 360.
        </p>
      </footer>
    </div>
  );
}
