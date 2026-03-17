import type { Metadata } from 'next';
import Link from 'next/link';
import RevealScript from '@/components/RevealScript';

export const metadata: Metadata = {
  title: 'Ravello HR — HR Diagnostics, Strategy & Project Delivery',
  description: 'Ravello HR helps UK businesses fix broken hiring, close compliance gaps, and manage people risk with diagnostic tools and expert HR delivery.',
};

/* ─── Pseudo-UI elements for product cards ─── */
function HiringScoreUI() {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 8, padding: '12px 14px', marginTop: 'auto',
    }}>
      <p style={{ fontSize: '10px', color: 'rgba(240,238,255,0.4)', marginBottom: 8, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>HIRING SCORE</p>
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 28 }}>
        {[40, 65, 85, 50, 30].map((h, i) => (
          <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: '2px 2px 0 0', background: i < 2 ? 'rgba(239,68,68,0.6)' : i === 3 ? 'rgba(245,158,11,0.6)' : 'linear-gradient(to top, #7B2FBE, #4B6EF5)' }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
        {['A', 'B', 'C', 'D', 'E'].map(l => (
          <div key={l} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'rgba(240,238,255,0.3)', fontFamily: 'var(--font-mono)' }}>{l}</div>
        ))}
      </div>
    </div>
  );
}

function PolicyCheckUI() {
  const items = [
    { label: 'Employment contracts', done: true },
    { label: 'Disciplinary procedure', done: true },
    { label: 'Absence management policy', risk: true },
  ];
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 8, padding: '12px 14px', marginTop: 'auto',
    }}>
      <p style={{ fontSize: '10px', color: 'rgba(240,238,255,0.4)', marginBottom: 8, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>POLICY AUDIT</p>
      {items.map(item => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{
            width: 14, height: 14, borderRadius: 3, flexShrink: 0,
            background: item.done ? 'rgba(16,185,129,0.2)' : item.risk ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${item.done ? 'rgba(16,185,129,0.5)' : item.risk ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9,
          }}>
            {item.done ? '✓' : item.risk ? '!' : ''}
          </div>
          <span style={{ fontSize: 10, color: item.risk ? 'rgba(252,165,165,0.8)' : 'rgba(240,238,255,0.5)', fontFamily: 'var(--font-mono)' }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function DealReadyUI() {
  const areas = [
    { label: 'Contracts',    pct: 85, color: '#10B981' },
    { label: 'Key persons',  pct: 35, color: '#EF4444' },
    { label: 'Culture risk', pct: 60, color: '#F59E0B' },
  ];
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 8, padding: '12px 14px', marginTop: 'auto',
    }}>
      <p style={{ fontSize: '10px', color: 'rgba(240,238,255,0.4)', marginBottom: 8, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>PEOPLE RISK</p>
      {areas.map(a => (
        <div key={a.label} style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 9, color: 'rgba(240,238,255,0.4)', fontFamily: 'var(--font-mono)' }}>{a.label}</span>
            <span style={{ fontSize: 9, color: a.color, fontFamily: 'var(--font-mono)' }}>{a.pct}%</span>
          </div>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
            <div style={{ height: '100%', width: `${a.pct}%`, background: a.color, borderRadius: 2 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Hero score card visual ─── */
function HeroScoreCard() {
  return (
    <div style={{
      background: 'var(--color-deep)',
      border: '1px solid rgba(123,47,190,0.3)',
      borderRadius: 16,
      padding: '1.5rem',
      width: '100%',
      maxWidth: 360,
      boxShadow: '0 24px 80px rgba(0,0,0,0.5), 0 0 60px rgba(123,47,190,0.12)',
      position: 'relative',
    }}>
      {/* Gradient top line */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(135deg, #7B2FBE, #4B6EF5, #E040A0)', borderRadius: '16px 16px 0 0' }} />

      <div style={{ marginBottom: '1.25rem' }}>
        <p style={{ fontSize: 11, color: 'rgba(240,238,255,0.35)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', marginBottom: 8 }}>SMART HIRING SYSTEM™</p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{
            fontSize: '3rem', fontFamily: 'var(--font-mono)', fontWeight: 700,
            background: 'linear-gradient(135deg, #A855F7, #6366F1, #EC4899)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>34</span>
          <span style={{ fontSize: 16, color: 'rgba(240,238,255,0.4)', fontFamily: 'var(--font-mono)' }}>/100</span>
        </div>
        <p style={{ fontSize: 12, color: '#FCA5A5', marginTop: 4 }}>High risk — action needed</p>
      </div>

      {[
        { label: 'Job brief quality',    score: 20, color: '#EF4444' },
        { label: 'Interview consistency', score: 45, color: '#F59E0B' },
        { label: 'Onboarding process',   score: 30, color: '#EF4444' },
        { label: 'Offer management',     score: 55, color: '#F59E0B' },
        { label: 'Retention signals',    score: 18, color: '#EF4444' },
      ].map(item => (
        <div key={item.label} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: 'rgba(240,238,255,0.55)', fontFamily: 'var(--font-mono)' }}>{item.label}</span>
            <span style={{ fontSize: 11, color: item.color, fontFamily: 'var(--font-mono)' }}>{item.score}</span>
          </div>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
            <div style={{ height: '100%', width: `${item.score}%`, background: item.color, borderRadius: 2, opacity: 0.7 }} />
          </div>
        </div>
      ))}

      <div style={{
        marginTop: '1rem', padding: '0.75rem', borderRadius: 8,
        background: 'rgba(123,47,190,0.1)', border: '1px solid rgba(123,47,190,0.2)',
      }}>
        <p style={{ fontSize: 11, color: 'rgba(240,238,255,0.6)', fontFamily: 'var(--font-mono)' }}>
          ↗ Book a call to fix these gaps
        </p>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      <RevealScript />

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 1 — HERO
      ═══════════════════════════════════════════════════════════════════ */}
      <section style={{ background: 'var(--color-void)', position: 'relative', overflow: 'hidden', minHeight: '92vh', display: 'flex', alignItems: 'center' }}>
        {/* Animated gradient orbs */}
        <div className="hero-orb" style={{ width: 600, height: 600, top: '-10%', left: '-5%', background: 'radial-gradient(circle, rgba(123,47,190,0.18) 0%, transparent 70%)' }} />
        <div className="hero-orb" style={{ width: 400, height: 400, top: '40%', right: '-8%', background: 'radial-gradient(circle, rgba(75,110,245,0.15) 0%, transparent 70%)', animationDelay: '4s' }} />
        <div className="hero-orb" style={{ width: 300, height: 300, bottom: '10%', left: '30%', background: 'radial-gradient(circle, rgba(224,64,160,0.10) 0%, transparent 70%)', animationDelay: '2s' }} />

        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '6rem 2rem', width: '100%', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4rem', alignItems: 'center' }}>
            {/* Left — copy */}
            <div style={{ maxWidth: 640 }}>
              <span className="hero-eyebrow section-label" style={{ marginBottom: '1.5rem' }}>
                HR STRATEGY + DIAGNOSTICS + DELIVERY
              </span>

              <h1 className="hero-h1-line1" style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-hero)',
                fontWeight: 900,
                letterSpacing: '-0.03em',
                lineHeight: 1.05,
                color: 'var(--color-text-primary)',
                marginBottom: '1.5rem',
              }}>
                Your people problems{' '}
                <span className="gradient-text">cost more than you think</span>
              </h1>

              <p className="hero-sub" style={{
                fontSize: 'var(--text-large)',
                color: 'var(--color-text-secondary)',
                lineHeight: 'var(--leading-relaxed)',
                marginBottom: '2.5rem',
                maxWidth: 520,
              }}>
                Ravello HR uses diagnostic tools and systematic delivery to fix broken hiring, close compliance gaps, and manage people risk — before they become costly problems.
              </p>

              <div className="hero-ctas" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <Link href="/smart-hiring-system/score" className="btn-primary">
                  Score your hiring process →
                </Link>
                <Link href="/contact" className="btn-secondary">
                  Book a scoping call
                </Link>
              </div>
            </div>

            {/* Right — hero visual */}
            <div className="hero-visual" style={{ flexShrink: 0 }}>
              <HeroScoreCard />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 2 — USP PRODUCT STRIP
      ═══════════════════════════════════════════════════════════════════ */}
      <section style={{ background: 'var(--color-deep)' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '7rem 2rem' }}>
          <span className="section-label" data-reveal>THE THREE DIAGNOSTIC PRODUCTS</span>

          <div data-reveal-stagger style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '1.5rem',
            alignItems: 'start',
          }}>
            {/* Smart Hiring System™ */}
            <div className="product-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '0.75rem' }}>
                  Smart Hiring System™
                </h3>
                <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-normal)' }}>
                  Score your hiring process against five proven failure points and see exactly where you&apos;re losing candidates and money.
                </p>
              </div>
              <HiringScoreUI />
              <Link href="/smart-hiring-system" className="btn-text" style={{ marginTop: '0.5rem' }}>
                Take the score check
              </Link>
            </div>

            {/* PolicySafe™ — centre card, elevated */}
            <div className="product-card" style={{ transform: 'translateY(-12px)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '0.75rem' }}>
                  PolicySafe™
                </h3>
                <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-normal)' }}>
                  Check your people documents against legal requirements and get a prioritised gap report with a clear path to compliance.
                </p>
              </div>
              <PolicyCheckUI />
              <Link href="/policysafe" className="btn-text" style={{ marginTop: '0.5rem' }}>
                Run the healthcheck
              </Link>
            </div>

            {/* DealReady People™ */}
            <div className="product-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '0.75rem' }}>
                  DealReady People™
                </h3>
                <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-normal)' }}>
                  Identify people risk before a deal closes — undisclosed liabilities, key person dependencies, and culture collision points.
                </p>
              </div>
              <DealReadyUI />
              <Link href="/dealready-people" className="btn-text" style={{ marginTop: '0.5rem' }}>
                Check your deal readiness
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 3 — WHO RAVELLO HR SUPPORTS
      ═══════════════════════════════════════════════════════════════════ */}
      <section style={{ background: 'var(--color-light-bg)' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '8rem 2rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '65fr 35fr', gap: '5rem', alignItems: 'start' }}>
            {/* Left */}
            <div data-reveal>
              <span className="section-label-dark section-label" style={{ color: 'var(--color-purple)' }}>WHO RAVELLO HR WORKS WITH</span>
              <h2 style={{
                fontFamily: 'var(--font-display)', fontWeight: 900,
                fontSize: 'var(--text-h2)', color: 'var(--color-text-dark)',
                letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: '1.5rem',
              }}>
                Every stage of business growth breaks HR in a different way
              </h2>
              <p style={{ fontSize: 'var(--text-large)', color: 'var(--color-text-dark-secondary)', lineHeight: 'var(--leading-relaxed)', maxWidth: 520 }}>
                Ravello HR works with UK businesses at every stage — from start-ups building people processes for the first time to established organisations fixing what&apos;s been quietly breaking for years.
              </p>
              <p style={{ fontSize: 'var(--text-body)', color: 'var(--color-text-dark-secondary)', lineHeight: 'var(--leading-relaxed)', marginTop: '1rem', maxWidth: 520 }}>
                The tools are built to surface the real problem, not describe the symptoms. Whether that&apos;s a hiring process leaking money, a compliance gap waiting to become a tribunal, or a deal that needs its people risk quantified before it closes.
              </p>
            </div>

            {/* Right — audience tiles */}
            <div data-reveal-stagger style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[
                { label: 'Start-up', desc: 'Building HR from scratch without the overhead of a full people function.' },
                { label: 'Scale-up', desc: 'HR that worked at 30 people is breaking at 80. Processes need to catch up with growth.' },
                { label: 'Established', desc: 'Policies that were written years ago and haven\'t been reviewed since. A liability, not a foundation.' },
                { label: 'Corporate', desc: 'Acquisition, restructure, or compliance need requiring expert, embedded delivery.' },
              ].map(a => (
                <div key={a.label} style={{
                  background: 'var(--color-light-surface)',
                  border: '1px solid var(--color-light-border)',
                  borderRadius: 10, padding: '1.25rem 1.5rem',
                  transition: 'border-color 0.2s ease, transform 0.2s ease',
                }}>
                  <p style={{ fontSize: 'var(--text-small)', fontWeight: 700, color: 'var(--color-text-dark)', marginBottom: '0.25rem', fontFamily: 'var(--font-body)' }}>{a.label}</p>
                  <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-dark-secondary)', lineHeight: 1.5 }}>{a.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 4 — WHY RAVELLO HR IS DIFFERENT
      ═══════════════════════════════════════════════════════════════════ */}
      <section style={{ background: 'var(--color-void)' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '8rem 2rem' }}>
          <div data-reveal style={{ marginBottom: '4rem' }}>
            <span className="section-label">WHY RAVELLO HR IS DIFFERENT</span>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontWeight: 900,
              fontSize: 'var(--text-h2)', color: 'var(--color-text-primary)',
              letterSpacing: '-0.02em', lineHeight: 1.2, maxWidth: 640,
            }}>
              Most HR consultancies describe the problem.<br />
              <span className="gradient-text">Ravello HR fixes it.</span>
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5rem' }}>
            {/* Differentiator 1 — text left */}
            <div data-reveal style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5rem', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-purple-light)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', display: 'block', marginBottom: '0.75rem' }}>01</span>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'var(--text-h3)', color: 'var(--color-text-primary)', marginBottom: '1rem', lineHeight: 1.2 }}>Strategic thinking, not just process documentation</h3>
                <p style={{ color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)' }}>
                  HR that just documents what already exists isn&apos;t HR — it&apos;s administration. Ravello HR brings commercial thinking to every people challenge, connecting HR decisions to business outcomes.
                </p>
                <p style={{ color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)', marginTop: '0.75rem' }}>
                  The work always starts with understanding what the business is trying to do, not what the HR textbook says should happen next.
                </p>
              </div>
              <div style={{
                background: 'var(--color-deep)', border: '1px solid var(--color-border)',
                borderRadius: 16, padding: '2rem', height: 220,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>⚡</div>
                  <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-muted)' }}>Business-connected HR</p>
                </div>
              </div>
            </div>

            {/* Differentiator 2 — visual left */}
            <div data-reveal style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5rem', alignItems: 'center' }}>
              <div style={{
                background: 'var(--color-deep)', border: '1px solid var(--color-border)',
                borderRadius: 16, padding: '2rem', height: 220,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🔧</div>
                  <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-muted)' }}>Delivery, not just advice</p>
                </div>
              </div>
              <div>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-purple-light)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', display: 'block', marginBottom: '0.75rem' }}>02</span>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'var(--text-h3)', color: 'var(--color-text-primary)', marginBottom: '1rem', lineHeight: 1.2 }}>Practical implementation, not recommendations to a shelf</h3>
                <p style={{ color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)' }}>
                  Consultancy advice is only as valuable as what gets built from it. Ravello HR stays in the room — through design, implementation, and the point where it starts to work in the business.
                </p>
                <p style={{ color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)', marginTop: '0.75rem' }}>
                  Every engagement ends with something usable, not a report that needs another consultant to action.
                </p>
              </div>
            </div>

            {/* Differentiator 3 — text left */}
            <div data-reveal style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5rem', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-purple-light)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', display: 'block', marginBottom: '0.75rem' }}>03</span>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'var(--text-h3)', color: 'var(--color-text-primary)', marginBottom: '1rem', lineHeight: 1.2 }}>Diagnostic tools that quantify the problem before the conversation</h3>
                <p style={{ color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)' }}>
                  Most HR engagements start with a vague scope call and end with a wide proposal. Ravello HR starts with a diagnostic — so both sides know what is actually broken before a day of work is spent.
                </p>
                <p style={{ color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)', marginTop: '0.75rem' }}>
                  Smart Hiring System™, PolicySafe™, and DealReady People™ are built to turn a gut feeling into a scored, prioritised action plan.
                </p>
              </div>
              <div style={{
                background: 'var(--color-deep)', border: '1px solid var(--color-border)',
                borderRadius: 16, padding: '2rem', height: 220,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>📊</div>
                  <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-muted)' }}>Evidence before engagement</p>
                </div>
              </div>
            </div>

            {/* Differentiator 4 — visual left */}
            <div data-reveal style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5rem', alignItems: 'center' }}>
              <div style={{
                background: 'var(--color-deep)', border: '1px solid var(--color-border)',
                borderRadius: 16, padding: '2rem', height: 220,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🤝</div>
                  <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-muted)' }}>Specialist partner network</p>
                </div>
              </div>
              <div>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-purple-light)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', display: 'block', marginBottom: '0.75rem' }}>04</span>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'var(--text-h3)', color: 'var(--color-text-primary)', marginBottom: '1rem', lineHeight: 1.2 }}>Access to specialist recruitment expertise through a vetted partner network</h3>
                <p style={{ color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)' }}>
                  When a role needs filling, Ravello HR connects clients to a network of specialist recruiters rather than building in an agency dependency. The right specialist for the right hire.
                </p>
                <p style={{ color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)', marginTop: '0.75rem' }}>
                  This means access to top recruitment expertise without managing multiple agencies or inheriting their incentives.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 5 — CREDIBILITY
      ═══════════════════════════════════════════════════════════════════ */}
      <section style={{ background: 'var(--color-light-bg)' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '8rem 2rem' }}>
          <div data-reveal style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6rem', alignItems: 'center' }}>
            {/* Left — offset image placeholder */}
            <div style={{ position: 'relative' }}>
              <div style={{
                width: '110%', aspectRatio: '4/5',
                background: 'linear-gradient(135deg, rgba(123,47,190,0.15), rgba(75,110,245,0.10))',
                border: '1px solid var(--color-light-border)',
                borderRadius: 20,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative', left: '-10%',
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg, #7B2FBE, #4B6EF5)', margin: '0 auto 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>
                    👤
                  </div>
                  <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-dark-secondary)' }}>Lucinda — Founder</p>
                </div>
              </div>
            </div>

            {/* Right — credibility copy */}
            <div>
              <span className="section-label-dark section-label" style={{ color: 'var(--color-purple)' }}>THE PEOPLE BEHIND RAVELLO HR</span>
              <h2 style={{
                fontFamily: 'var(--font-display)', fontWeight: 900,
                fontSize: 'var(--text-h2)', color: 'var(--color-text-dark)',
                letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: '1.5rem',
              }}>
                Commercial HR experience, not theoretical frameworks
              </h2>
              <p style={{ fontSize: 'var(--text-body)', color: 'var(--color-text-dark-secondary)', lineHeight: 'var(--leading-relaxed)', marginBottom: '1rem' }}>
                Ravello HR was founded by Lucinda, an HR professional with board-level experience across blue-chip organisations and high-growth start-ups. The credibility comes from having sat in the chair where the difficult decisions are made.
              </p>
              <p style={{ fontSize: 'var(--text-body)', color: 'var(--color-text-dark-secondary)', lineHeight: 'var(--leading-relaxed)', marginBottom: '2rem' }}>
                That span — from highly structured corporate environments to fast-moving scale-ups — is why the diagnostic tools work: they&apos;re built on knowing what breaks at every stage.
              </p>

              {/* Credibility signals */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
                {[
                  { stat: 'FTSE-listed', label: 'Corporate HR experience' },
                  { stat: 'Series A–C', label: 'Scale-up environments' },
                  { stat: 'UK-wide', label: 'Multi-sector delivery' },
                  { stat: '15+ years', label: 'Senior HR leadership' },
                ].map(s => (
                  <div key={s.stat} style={{
                    background: 'var(--color-light-surface)',
                    border: '1px solid var(--color-light-border)',
                    borderRadius: 10, padding: '1rem 1.25rem',
                  }}>
                    <p style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--color-text-dark)', fontSize: '1.1rem' }}>{s.stat}</p>
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dark-secondary)' }}>{s.label}</p>
                  </div>
                ))}
              </div>

              <Link href="/about" className="btn-text-dark">
                About Ravello HR
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 6 — FINAL CONVERSION BLOCK
      ═══════════════════════════════════════════════════════════════════ */}
      <section style={{
        background: 'var(--color-void)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Gradient wash */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(-45deg, #08070F, #7B2FBE, #4B6EF5, #E040A0, #08070F)',
          backgroundSize: '400% 400%',
          animation: 'gradient-shift 12s ease infinite',
          opacity: 0.12,
          pointerEvents: 'none',
        }} />

        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '8rem 2rem', position: 'relative', zIndex: 1 }}>
          <div data-reveal style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <span className="section-label" style={{ justifyContent: 'center', display: 'flex' }}>START SOMEWHERE</span>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontWeight: 900,
              fontSize: 'var(--text-h2)', color: 'var(--color-text-primary)',
              letterSpacing: '-0.02em', lineHeight: 1.2,
            }}>
              Three ways to work with Ravello HR
            </h2>
          </div>

          <div data-reveal-stagger style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0', alignItems: 'stretch' }}>
            {/* Path 1 */}
            <div style={{ padding: '2.5rem', textAlign: 'center', borderRight: '1px solid var(--color-border)' }}>
              <div style={{
                width: 56, height: 56, borderRadius: 12, margin: '0 auto 1.5rem',
                background: 'rgba(123,47,190,0.15)', border: '1px solid rgba(123,47,190,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
              }}>📊</div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.25rem', color: 'var(--color-text-primary)', marginBottom: '0.75rem' }}>
                Get your hiring score
              </h3>
              <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-normal)', marginBottom: '1.5rem' }}>
                Score your hiring process in 3 minutes and see exactly which failure points are costing you candidates and money.
              </p>
              <Link href="/smart-hiring-system/score" className="btn-primary" style={{ justifyContent: 'center', width: '100%' }}>
                Score your hiring →
              </Link>
            </div>

            {/* Path 2 */}
            <div style={{ padding: '2.5rem', textAlign: 'center', borderRight: '1px solid var(--color-border)' }}>
              <div style={{
                width: 56, height: 56, borderRadius: 12, margin: '0 auto 1.5rem',
                background: 'rgba(75,110,245,0.15)', border: '1px solid rgba(75,110,245,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
              }}>📄</div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.25rem', color: 'var(--color-text-primary)', marginBottom: '0.75rem' }}>
                Download a free template
              </h3>
              <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-normal)', marginBottom: '1.5rem' }}>
                Get a free starter handbook template as a benchmark for where your people documents should be.
              </p>
              <Link href="/policysafe/templates" className="btn-secondary" style={{ justifyContent: 'center', width: '100%' }}>
                Download template
              </Link>
            </div>

            {/* Path 3 */}
            <div style={{ padding: '2.5rem', textAlign: 'center' }}>
              <div style={{
                width: 56, height: 56, borderRadius: 12, margin: '0 auto 1.5rem',
                background: 'rgba(224,64,160,0.15)', border: '1px solid rgba(224,64,160,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
              }}>📞</div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.25rem', color: 'var(--color-text-primary)', marginBottom: '0.75rem' }}>
                Book a scoping call
              </h3>
              <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-normal)', marginBottom: '1.5rem' }}>
                Talk through the specific people challenge your business is facing and find out whether Ravello HR is the right fit.
              </p>
              <Link href="/contact" className="btn-secondary" style={{ justifyContent: 'center', width: '100%' }}>
                Book a call
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
