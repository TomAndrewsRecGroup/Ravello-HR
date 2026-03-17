import type { Metadata } from 'next';
import Link from 'next/link';
import RevealScript from '@/components/RevealScript';

export const metadata: Metadata = {
  title: 'About Ravello HR | HR Consultant UK',
  description: 'Ravello HR is built on board-level HR experience across blue-chip and high-growth businesses. Commercial HR thinking, not theoretical frameworks.',
};

export default function AboutPage() {
  return (
    <>
      <RevealScript />
      <section style={{ background: 'var(--color-void)', paddingTop: '6rem', paddingBottom: '5rem' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '4rem 2rem' }}>
          <nav className="breadcrumb"><Link href="/">Home</Link><span>›</span><span>About</span></nav>
          <div style={{ maxWidth: 680 }}>
            <span className="section-label">ABOUT RAVELLO HR</span>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'var(--text-display)', letterSpacing: '-0.03em', lineHeight: 1.05, color: 'var(--color-text-primary)', marginBottom: '1.5rem' }}>
              Commercial HR thinking,<br /><span className="gradient-text">not theoretical frameworks</span>
            </h1>
            <p style={{ fontSize: 'var(--text-large)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)' }}>
              Ravello HR exists because too many businesses are receiving HR advice that looks good in a document and falls apart in practice.
            </p>
          </div>
        </div>
      </section>

      <section style={{ background: 'var(--color-light-bg)' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '7rem 2rem' }}>
          <div data-reveal style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6rem', alignItems: 'start' }}>
            <div>
              <span className="section-label-dark section-label" style={{ color: 'var(--color-purple)' }}>THE APPROACH</span>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'var(--text-h2)', color: 'var(--color-text-dark)', letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: '1.5rem' }}>
                Ravello HR starts with the business problem, not the HR solution
              </h2>
              <p style={{ color: 'var(--color-text-dark-secondary)', lineHeight: 'var(--leading-relaxed)', marginBottom: '1rem' }}>
                The three diagnostic products — Smart Hiring System™, PolicySafe™, and DealReady People™ — are not assessment tools designed to justify a retainer. They are built to surface what is actually broken so the right work can start.
              </p>
              <p style={{ color: 'var(--color-text-dark-secondary)', lineHeight: 'var(--leading-relaxed)', marginBottom: '1rem' }}>
                Most HR engagements start with a vague scope conversation and end with a wide proposal covering everything and fixing nothing. Ravello HR does not work that way.
              </p>
              <p style={{ color: 'var(--color-text-dark-secondary)', lineHeight: 'var(--leading-relaxed)', marginBottom: '2rem' }}>
                The starting point is always: what is the specific people problem this business is experiencing, and what is the minimum effective intervention to fix it?
              </p>
              <Link href="/smart-hiring-system/score" className="btn-text-dark">Score your hiring process</Link>
            </div>

            <div>
              <span className="section-label-dark section-label" style={{ color: 'var(--color-purple)' }}>THE BACKGROUND</span>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'var(--text-h2)', color: 'var(--color-text-dark)', letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: '1.5rem' }}>
                Board-level HR experience across the full business spectrum
              </h2>
              <p style={{ color: 'var(--color-text-dark-secondary)', lineHeight: 'var(--leading-relaxed)', marginBottom: '1rem' }}>
                Ravello HR was founded by Lucinda, an HR professional with extensive experience spanning FTSE-listed organisations and fast-growing start-ups. The breadth of that background — from highly structured corporate HR to the pragmatic, high-speed decision-making of scale-ups — is the foundation of how Ravello HR works.
              </p>
              <p style={{ color: 'var(--color-text-dark-secondary)', lineHeight: 'var(--leading-relaxed)', marginBottom: '2rem' }}>
                That experience across sectors, business sizes, and transaction types means the diagnostic tools are built on having seen what breaks and when — not on what should theoretically work.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {[
                  { stat: 'FTSE-listed', label: 'Corporate HR experience' },
                  { stat: 'Series A–C', label: 'Scale-up environments' },
                  { stat: 'UK-wide', label: 'Multi-sector delivery' },
                  { stat: '15+ years', label: 'Senior HR leadership' },
                ].map(s => (
                  <div key={s.stat} style={{ background: 'var(--color-light-surface)', border: '1px solid var(--color-light-border)', borderRadius: 10, padding: '1rem 1.25rem' }}>
                    <p style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--color-text-dark)', fontSize: '1.1rem' }}>{s.stat}</p>
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dark-secondary)' }}>{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section style={{ background: 'var(--color-void)', borderTop: '1px solid var(--color-border)' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto', padding: '5rem 2rem', textAlign: 'center' }} data-reveal>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'var(--text-h2)', color: 'var(--color-text-primary)', letterSpacing: '-0.02em', marginBottom: '1.5rem' }}>
            Talk to Ravello HR about what you&apos;re trying to fix
          </h2>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/contact" className="btn-primary">Book a scoping call →</Link>
            <Link href="/smart-hiring-system" className="btn-secondary">Explore the diagnostics</Link>
          </div>
        </div>
      </section>
    </>
  );
}
