import type { Metadata } from 'next';
import Link from 'next/link';
import RevealScript from '@/components/RevealScript';

export const metadata: Metadata = {
  title: 'HR Services | Ravello HR',
  description: 'Ravello HR delivers HR strategy, project delivery, compliance reviews, and people process builds for UK businesses at every stage of growth.',
};

const SERVICES = [
  {
    product: 'Smart Hiring System™',
    href: '/smart-hiring-system',
    services: [
      { name: 'Hiring process audit', desc: 'A full review of your end-to-end hiring process — from brief to onboarding — with a scored output and prioritised recommendations.' },
      { name: 'Interview framework build', desc: 'Designing a consistent, structured interview process with shared criteria, question banks, and evaluation tools that managers actually use.' },
      { name: 'Onboarding process design', desc: 'Building a 30/60/90 day onboarding structure that improves retention and accelerates productivity from day one.' },
    ],
  },
  {
    product: 'PolicySafe™',
    href: '/policysafe',
    services: [
      { name: 'Employment document review', desc: 'A comprehensive review of your contracts, handbook, and key policies against current UK employment law requirements.' },
      { name: 'Document drafting and rebuild', desc: 'Writing or rebuilding contracts, handbooks, and policies from scratch — compliant, practical, and written for the people who will use them.' },
      { name: 'Manager guidance packs', desc: 'Clear, written guidance for line managers on how to handle performance, absence, grievance, and disciplinary situations correctly.' },
    ],
  },
  {
    product: 'DealReady People™',
    href: '/dealready-people',
    services: [
      { name: 'Pre-acquisition HR due diligence', desc: 'A structured review of the target business\'s employment liabilities, key person risk, and compliance position before completion.' },
      { name: 'Post-acquisition integration support', desc: 'First-90-days planning, people communications strategy, and HR compliance alignment following a transaction.' },
      { name: 'Exit preparation', desc: 'Preparing an owner-managed business for sale by addressing people risk areas that buyers will identify during their own due diligence.' },
    ],
  },
  {
    product: 'Standalone HR delivery',
    href: '/contact',
    services: [
      { name: 'Fractional HR Director', desc: 'Senior HR thinking on a retained basis — for businesses that need strategic HR without the cost of a full-time hire.' },
      { name: 'HR project delivery', desc: 'Scoped, time-bounded HR projects — restructures, culture programmes, TUPE transfers, capability frameworks.' },
      { name: 'People strategy development', desc: 'Building a people strategy that connects directly to business objectives, not a standalone HR plan that no one reads.' },
    ],
  },
];

export default function ServicesPage() {
  return (
    <>
      <RevealScript />

      {/* Hero */}
      <section style={{ background: 'var(--color-void)', paddingTop: '6rem', paddingBottom: '5rem' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '4rem 2rem' }}>
          <nav className="breadcrumb"><Link href="/">Home</Link><span>›</span><span>Services</span></nav>
          <div style={{ maxWidth: 680 }}>
            <span className="section-label">SERVICES</span>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'var(--text-display)', letterSpacing: '-0.03em', lineHeight: 1.05, color: 'var(--color-text-primary)', marginBottom: '1.5rem' }}>
              The implementation layer<br />
              <span className="gradient-text">behind the diagnostics</span>
            </h1>
            <p style={{ fontSize: 'var(--text-large)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)' }}>
              Ravello HR&apos;s services are the practical delivery that turns a diagnostic score or gap report into a fixed process, a compliant document set, or a de-risked transaction.
            </p>
          </div>
        </div>
      </section>

      {/* Services grid */}
      <section style={{ background: 'var(--color-deep)' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '7rem 2rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5rem' }}>
            {SERVICES.map((group, gi) => (
              <div key={group.product} data-reveal>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                  <Link href={group.href} className="section-label" style={{ marginBottom: 0, textDecoration: 'none', transition: 'opacity 0.2s ease' }}>
                    {group.product.toUpperCase()}
                  </Link>
                  <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
                  <Link href={group.href} className="btn-text" style={{ fontSize: 'var(--text-xs)' }}>
                    View product
                  </Link>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
                  {group.services.map(svc => (
                    <div key={svc.name} className="feature-tile">
                      <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: 'var(--color-text-primary)', marginBottom: '0.75rem', lineHeight: 1.3 }}>{svc.name}</h3>
                      <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)' }}>{svc.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: 'var(--color-void)', borderTop: '1px solid var(--color-border)' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto', padding: '5rem 2rem', textAlign: 'center' }} data-reveal>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'var(--text-h2)', color: 'var(--color-text-primary)', letterSpacing: '-0.02em', marginBottom: '1.5rem' }}>
            Start with a diagnostic
          </h2>
          <p style={{ color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)', marginBottom: '2.5rem' }}>
            The best starting point for most Ravello HR engagements is one of the diagnostic tools — so both sides understand what&apos;s actually broken before a scope is agreed.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/smart-hiring-system/score" className="btn-primary">Score your hiring process →</Link>
            <Link href="/contact" className="btn-secondary">Book a scoping call</Link>
          </div>
        </div>
      </section>
    </>
  );
}
