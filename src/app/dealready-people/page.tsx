import type { Metadata } from 'next';
import Link from 'next/link';
import RevealScript from '@/components/RevealScript';

export const metadata: Metadata = {
  title: 'DealReady People™ | Pre-Acquisition People Due Diligence | Ravello HR',
  description: 'People risk is the most underpriced risk in any acquisition. DealReady People™ identifies key person dependencies, hidden liabilities, and culture collision points before the deal closes.',
};

const THEMES = [
  { id: '01', stage: 'Pre-deal', title: 'Employment liabilities', desc: 'Undisclosed claims, tribunal history, TUPE obligations, and contracts that don\'t reflect actual terms. These become the buyer\'s problem at completion.' },
  { id: '02', stage: 'Pre-deal', title: 'Key person dependency', desc: 'Businesses where two or three people hold all the client relationships, institutional knowledge, or delivery capability are high risk. Identify who they are and what happens if they leave.' },
  { id: '03', stage: 'Pre-deal', title: 'Culture collision risk', desc: 'Two businesses with fundamentally different management styles, values, or operational cultures will struggle post-deal. The damage is predictable — and usually ignored.' },
  { id: '04', stage: 'Post-deal', title: 'Integration planning', desc: 'The decisions made in the first 90 days post-acquisition determine retention, morale, and productivity. Most integrations are under-planned.' },
  { id: '05', stage: 'Post-deal', title: 'Compliance alignment', desc: 'Bringing the acquired business\'s HR practices up to the acquirer\'s standards requires a systematic review, not an assumption that they\'ll figure it out.' },
];

export default function DealReadyPeoplePage() {
  return (
    <>
      <RevealScript />

      {/* Hero */}
      <section style={{ background: 'var(--color-void)', position: 'relative', overflow: 'hidden', paddingTop: '6rem', paddingBottom: '6rem' }}>
        <div className="hero-orb" style={{ width: 500, height: 500, bottom: '-10%', right: '-5%', background: 'radial-gradient(circle, rgba(224,64,160,0.16) 0%, transparent 70%)' }} />
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '4rem 2rem', position: 'relative', zIndex: 1 }}>
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span>›</span>
            <span>DealReady People™</span>
          </nav>

          <div style={{ maxWidth: 720 }}>
            <span className="section-label">DEALREADY PEOPLE™</span>
            <h1 style={{
              fontFamily: 'var(--font-display)', fontWeight: 900,
              fontSize: 'var(--text-display)', letterSpacing: '-0.03em', lineHeight: 1.05,
              color: 'var(--color-text-primary)', marginBottom: '1.5rem',
            }}>
              People risk is the most<br />
              <span className="gradient-text">underpriced risk in any acquisition</span>
            </h1>
            <p style={{ fontSize: 'var(--text-large)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)', marginBottom: '2.5rem', maxWidth: 580 }}>
              DealReady People™ identifies employment liabilities, key person dependencies, and culture collision points before the deal closes — so you know exactly what you&apos;re buying.
            </p>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <Link href="/dealready-people/pre-check" className="btn-primary">Run the pre-check →</Link>
              <Link href="/dealready-people/checklist" className="btn-secondary">Download the DD checklist</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Five risk themes */}
      <section style={{ background: 'var(--color-deep)' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '7rem 2rem' }}>
          <span className="section-label" data-reveal>THE FIVE PEOPLE-RISK THEMES</span>
          <h2 data-reveal style={{
            fontFamily: 'var(--font-display)', fontWeight: 900,
            fontSize: 'var(--text-h2)', color: 'var(--color-text-primary)',
            letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: '4rem', maxWidth: 600,
          }}>
            Where people risk hides — and why most acquirers miss it
          </h2>

          <div data-reveal-stagger style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {THEMES.map(t => (
              <div key={t.id} className="feature-tile" style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: '1.5rem', alignItems: 'start' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-purple-light)', minWidth: 20 }}>{t.id}</span>
                <span style={{
                  fontSize: 'var(--text-xs)', fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                  background: t.stage === 'Pre-deal' ? 'rgba(239,68,68,0.12)' : 'rgba(75,110,245,0.12)',
                  color: t.stage === 'Pre-deal' ? '#FCA5A5' : '#818CF8',
                  border: `1px solid ${t.stage === 'Pre-deal' ? 'rgba(239,68,68,0.25)' : 'rgba(75,110,245,0.25)'}`,
                  whiteSpace: 'nowrap', height: 'fit-content',
                }}>
                  {t.stage}
                </span>
                <div>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.05rem', color: 'var(--color-text-primary)', marginBottom: '0.5rem' }}>{t.title}</h3>
                  <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)' }}>{t.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who this is for */}
      <section style={{ background: 'var(--color-light-bg)' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '7rem 2rem' }}>
          <span className="section-label-dark section-label" data-reveal style={{ color: 'var(--color-purple)' }}>WHO THIS IS FOR</span>
          <h2 data-reveal style={{
            fontFamily: 'var(--font-display)', fontWeight: 900,
            fontSize: 'var(--text-h2)', color: 'var(--color-text-dark)',
            letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: '4rem', maxWidth: 560,
          }}>
            Anyone transacting on a business with people in it
          </h2>

          <div data-reveal-stagger style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
            {[
              { who: 'PE firms and acquirers', what: 'Pre-completion people due diligence to surface liabilities before they become the acquirer\'s problem at signing.' },
              { who: 'Owner-managed businesses', what: 'Preparing for an exit requires knowing where the people risk sits — because buyers will find it during their own DD.' },
              { who: 'Management buy-out teams', what: 'Understanding key person risk, compensation structure, and culture fit before the team commits to the transaction.' },
              { who: 'Corporate HR teams', what: 'Integration support for incoming acquisitions — from first 90 days planning to compliance alignment across entities.' },
            ].map(a => (
              <div key={a.who} className="card-light">
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.05rem', color: 'var(--color-text-dark)', marginBottom: '0.75rem' }}>{a.who}</h3>
                <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-dark-secondary)', lineHeight: 'var(--leading-relaxed)' }}>{a.what}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: 'var(--color-void)', borderTop: '1px solid var(--color-border)' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto', padding: '5rem 2rem', textAlign: 'center' }} data-reveal>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontWeight: 900,
            fontSize: 'var(--text-h2)', color: 'var(--color-text-primary)',
            letterSpacing: '-0.02em', marginBottom: '1.5rem',
          }}>
            Know your people risk before the deal closes
          </h2>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/dealready-people/pre-check" className="btn-primary">Run the 5-minute pre-check →</Link>
            <Link href="/dealready-people/checklist" className="btn-secondary">Download the DD checklist</Link>
            <Link href="/contact" className="btn-secondary">Confidential consultation</Link>
          </div>
        </div>
      </section>

      {/* Cross-sell */}
      <section style={{ background: 'var(--color-deep)', borderTop: '1px solid var(--color-border)' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '5rem 2rem' }}>
          <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>Also from Ravello HR</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <Link href="/smart-hiring-system" className="cross-sell-card">
              <span className="section-label" style={{ marginBottom: '0.5rem' }}>SMART HIRING SYSTEM™</span>
              <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--color-text-primary)' }}>Score your hiring process</p>
              <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)' }}>Find your hiring failure points →</p>
            </Link>
            <Link href="/policysafe" className="cross-sell-card">
              <span className="section-label" style={{ marginBottom: '0.5rem' }}>POLICYSAFE™</span>
              <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--color-text-primary)' }}>Check your compliance gaps</p>
              <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)' }}>Run a people document healthcheck →</p>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
