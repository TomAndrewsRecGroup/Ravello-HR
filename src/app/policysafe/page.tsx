import type { Metadata } from 'next';
export const dynamic = 'force-dynamic';
import Link from 'next/link';
import RevealScript from '@/components/RevealScript';

export const metadata: Metadata = {
  title: 'PolicySafe™ | HR Compliance & People Document Review | Ravello HR',
  description: 'Most businesses are one HR dispute away from a costly mistake. PolicySafe™ checks your people documents against legal requirements and delivers a prioritised gap report.',
};

const RISK_AREAS = [
  { id: '01', title: 'Missing or outdated contracts', desc: 'Employment contracts that don\'t reflect the current role, don\'t cover modern working arrangements, or simply don\'t exist for some employees are a tribunal waiting to happen.' },
  { id: '02', title: 'Unfit employee handbooks', desc: 'A handbook written before hybrid working or the latest Employment Rights Act changes is worse than no handbook — it sets expectations the business can\'t legally meet.' },
  { id: '03', title: 'No disciplinary or grievance framework', desc: 'When managers handle performance issues without a documented procedure, the business has no defence if a dismissal is challenged. Every informal conversation that should have been formal becomes evidence against you.' },
  { id: '04', title: 'Managers operating without guidance', desc: 'HR risk most often comes from well-meaning managers making it up as they go. Without a clear decision framework, every people conversation is a potential liability.' },
];

const PACKAGES = [
  {
    name: 'Starter',
    tagline: 'Benchmark your documents',
    price: 'From £495',
    includes: [
      'PolicySafe™ healthcheck',
      'Prioritised gap report (HIGH/MED/LOW)',
      'Free starter handbook template',
      'Written recommendations',
    ],
    cta: 'Book a call',
    href: '/contact',
  },
  {
    name: 'Core',
    tagline: 'Fix the critical gaps',
    price: 'From £1,800',
    includes: [
      'Everything in Starter',
      'Full contract and handbook review',
      'Bespoke policy drafting (up to 3 docs)',
      'Manager guidance notes',
      '30-day email support',
    ],
    cta: 'Book a call',
    href: '/contact',
    featured: true,
  },
  {
    name: 'Gold',
    tagline: 'Complete people document suite',
    price: 'From £4,200',
    includes: [
      'Everything in Core',
      'Full employment document suite',
      'Manager training session',
      'Quarterly review included',
      'Direct access to Ravello HR',
    ],
    cta: 'Book a call',
    href: '/contact',
  },
];

export default function PolicySafePage() {
  return (
    <>
      <RevealScript />

      {/* Hero */}
      <section style={{ background: 'var(--color-void)', position: 'relative', overflow: 'hidden', paddingTop: '6rem', paddingBottom: '6rem' }}>
        <div className="hero-orb" style={{ width: 500, height: 500, top: '-10%', right: '-5%', background: 'radial-gradient(circle, rgba(75,110,245,0.18) 0%, transparent 70%)' }} />
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '4rem 2rem', position: 'relative', zIndex: 1 }}>
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden>›</span>
            <span>PolicySafe™</span>
          </nav>

          <div style={{ maxWidth: 720 }}>
            <span className="section-label">POLICYSAFE™</span>
            <h1 style={{
              fontFamily: 'var(--font-display)', fontWeight: 900,
              fontSize: 'var(--text-display)', letterSpacing: '-0.03em', lineHeight: 1.05,
              color: 'var(--color-text-primary)', marginBottom: '1.5rem',
            }}>
              Most businesses are<br />
              <span className="gradient-text">one HR dispute away from a costly mistake</span>
            </h1>
            <p style={{ fontSize: 'var(--text-large)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)', marginBottom: '2.5rem', maxWidth: 580 }}>
              PolicySafe™ checks your people documents against current legal requirements and delivers a prioritised gap report — so you know exactly what&apos;s at risk and what to fix first.
            </p>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <Link href="/policysafe/healthcheck" className="btn-primary">Run the healthcheck →</Link>
              <Link href="/policysafe/templates" className="btn-secondary">Download a free template</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Four risk areas */}
      <section style={{ background: 'var(--color-deep)' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '7rem 2rem' }}>
          <span className="section-label" data-reveal>THE FOUR RISK AREAS</span>
          <h2 data-reveal style={{
            fontFamily: 'var(--font-display)', fontWeight: 900,
            fontSize: 'var(--text-h2)', color: 'var(--color-text-primary)',
            letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: '4rem', maxWidth: 600,
          }}>
            Most compliance problems come from the same four places
          </h2>

          <div data-reveal-stagger style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
            {RISK_AREAS.map(ra => (
              <div key={ra.id} className="feature-tile">
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-purple-light)', display: 'block', marginBottom: '0.75rem' }}>{ra.id}</span>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.05rem', color: 'var(--color-text-primary)', marginBottom: '0.75rem', lineHeight: 1.3 }}>{ra.title}</h3>
                <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)' }}>{ra.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Package comparison */}
      <section style={{ background: 'var(--color-light-bg)' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '7rem 2rem' }}>
          <span className="section-label-dark section-label" data-reveal style={{ color: 'var(--color-purple)' }}>PACKAGES</span>
          <h2 data-reveal style={{
            fontFamily: 'var(--font-display)', fontWeight: 900,
            fontSize: 'var(--text-h2)', color: 'var(--color-text-dark)',
            letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: '4rem', maxWidth: 560,
          }}>
            Choose the level of fix you need
          </h2>

          <div data-reveal-stagger style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
            {PACKAGES.map(pkg => (
              <div key={pkg.name} style={{
                background: pkg.featured ? 'var(--color-deep)' : 'var(--color-light-surface)',
                border: `1px solid ${pkg.featured ? 'rgba(123,47,190,0.4)' : 'var(--color-light-border)'}`,
                borderRadius: 12, padding: '2rem', position: 'relative',
                transition: 'transform 0.3s ease',
              }}>
                {pkg.featured && (
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                    background: 'linear-gradient(135deg, #7B2FBE, #4B6EF5, #E040A0)',
                    borderRadius: '12px 12px 0 0',
                  }} />
                )}
                {pkg.featured && (
                  <div style={{
                    position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                    background: 'linear-gradient(135deg, #7B2FBE, #4B6EF5)', color: 'white',
                    fontSize: 10, fontWeight: 700, padding: '2px 12px', borderRadius: 99,
                  }}>Most Popular</div>
                )}
                <p style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', color: pkg.featured ? 'var(--color-text-primary)' : 'var(--color-text-dark)', marginBottom: '0.25rem' }}>{pkg.name}</p>
                <p style={{ fontSize: 'var(--text-small)', color: pkg.featured ? 'var(--color-text-secondary)' : 'var(--color-text-dark-secondary)', marginBottom: '1.5rem' }}>{pkg.tagline}</p>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem', fontWeight: 700, color: pkg.featured ? 'var(--color-purple-light)' : 'var(--color-purple)', marginBottom: '1.5rem' }}>{pkg.price}</p>

                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 2rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  {pkg.includes.map(item => (
                    <li key={item} style={{ display: 'flex', gap: '0.625rem', fontSize: 'var(--text-small)', color: pkg.featured ? 'var(--color-text-secondary)' : 'var(--color-text-dark-secondary)' }}>
                      <span style={{ color: '#10B981', flexShrink: 0 }}>✓</span>
                      {item}
                    </li>
                  ))}
                </ul>

                <Link href={pkg.href} className={pkg.featured ? 'btn-primary' : 'btn-secondary-dark'} style={{ display: 'block', textAlign: 'center', justifyContent: 'center' }}>
                  {pkg.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA strip */}
      <section style={{ background: 'var(--color-void)', borderTop: '1px solid var(--color-border)' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto', padding: '5rem 2rem', textAlign: 'center' }} data-reveal>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontWeight: 900,
            fontSize: 'var(--text-h2)', color: 'var(--color-text-primary)',
            letterSpacing: '-0.02em', marginBottom: '1.5rem',
          }}>
            Find out where your compliance gaps are
          </h2>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/policysafe/healthcheck" className="btn-primary">Run the healthcheck →</Link>
            <Link href="/policysafe/templates" className="btn-secondary">Download a free template</Link>
            <Link href="/contact" className="btn-secondary">Book a call</Link>
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
            <Link href="/dealready-people" className="cross-sell-card">
              <span className="section-label" style={{ marginBottom: '0.5rem' }}>DEALREADY PEOPLE™</span>
              <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--color-text-primary)' }}>Pre-acquisition people due diligence</p>
              <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)' }}>Check your deal readiness →</p>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
