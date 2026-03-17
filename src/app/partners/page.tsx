import type { Metadata } from 'next';
import Link from 'next/link';
import RevealScript from '@/components/RevealScript';

export const metadata: Metadata = {
  title: 'Our Partner Network | Ravello HR',
  description: 'Ravello HR works with a network of specialist recruiters to give clients access to top recruitment expertise without managing multiple agencies.',
};

export default function PartnersPage() {
  return (
    <>
      <RevealScript />
      <section style={{ background: 'var(--color-void)', paddingTop: '6rem', paddingBottom: '5rem' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '4rem 2rem' }}>
          <nav className="breadcrumb"><Link href="/">Home</Link><span>›</span><span>Partners</span></nav>
          <div style={{ maxWidth: 680 }}>
            <span className="section-label">PARTNER NETWORK</span>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'var(--text-display)', letterSpacing: '-0.03em', lineHeight: 1.05, color: 'var(--color-text-primary)', marginBottom: '1.5rem' }}>
              The right specialist<br /><span className="gradient-text">for every hire</span>
            </h1>
            <p style={{ fontSize: 'var(--text-large)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)' }}>
              Ravello HR works with a network of specialist recruiters — giving clients access to top recruitment expertise without managing multiple agencies or inheriting their incentives.
            </p>
          </div>
        </div>
      </section>

      <section style={{ background: 'var(--color-deep)' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '7rem 2rem' }}>
          <div data-reveal style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5rem', alignItems: 'start', marginBottom: '5rem' }}>
            <div>
              <span className="section-label">HOW THE NETWORK WORKS</span>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'var(--text-h2)', color: 'var(--color-text-primary)', letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: '1.5rem' }}>
                Specialist recruiters. No agency overhead.
              </h2>
              <p style={{ color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)', marginBottom: '1rem' }}>
                Rather than building an internal recruitment function, Ravello HR maintains a vetted network of specialist recruiters — each selected for deep sector or function expertise. When a client has a hiring need, Ravello HR matches the requirement to the right specialist and manages the relationship.
              </p>
              <p style={{ color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)' }}>
                This model means clients get access to genuine specialist expertise for each role rather than a generalist firm that claims to cover everything.
              </p>
            </div>
            <div data-reveal-stagger style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {[
                { title: 'Vetted for sector expertise', desc: 'Every partner in the network is selected for demonstrated expertise in a specific sector or function — not general recruitment capability.' },
                { title: 'Matched to the requirement', desc: 'Ravello HR selects the right specialist for each hire rather than defaulting to a single supplier relationship.' },
                { title: 'One point of contact', desc: 'Clients deal with Ravello HR, not a rotating cast of agency account managers. The relationship stays consistent.' },
                { title: 'Aligned incentives', desc: 'The network model removes the agency incentive to fill a role quickly over filling it correctly.' },
              ].map(item => (
                <div key={item.title} className="feature-tile">
                  <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.95rem', color: 'var(--color-text-primary)', marginBottom: '0.5rem' }}>{item.title}</h3>
                  <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div data-reveal style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '2.5rem' }}>
            <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)' }}>
              <strong style={{ color: 'var(--color-text-primary)' }}>A note on transparency:</strong> Ravello HR works with a network of specialist recruiters to deliver hiring support for clients. The network covers multiple sectors and seniority levels across the UK. Individual partner details are shared with clients at the point of engagement, not publicly listed.
            </p>
          </div>
        </div>
      </section>

      <section style={{ background: 'var(--color-void)', borderTop: '1px solid var(--color-border)' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto', padding: '5rem 2rem', textAlign: 'center' }} data-reveal>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'var(--text-h2)', color: 'var(--color-text-primary)', letterSpacing: '-0.02em', marginBottom: '1.5rem' }}>
            Hiring support built into your HR engagement
          </h2>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/smart-hiring-system" className="btn-primary">Score your hiring process →</Link>
            <Link href="/contact" className="btn-secondary">Talk to Ravello HR</Link>
          </div>
        </div>
      </section>
    </>
  );
}
