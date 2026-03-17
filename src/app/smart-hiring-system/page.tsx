import type { Metadata } from 'next';
import Link from 'next/link';
import RevealScript from '@/components/RevealScript';

export const metadata: Metadata = {
  title: 'Smart Hiring System™ | Score Your Hiring Process | Ravello HR',
  description: 'Most hiring fails before the first interview. Use the Smart Hiring System™ diagnostic to score your process against five proven failure points.',
};

const FAILURE_POINTS = [
  { id: 'A', title: 'Brief quality', desc: 'Most roles go to market without a brief that means anything. Vague job descriptions attract the wrong candidates and waste everyone\'s time from the start.' },
  { id: 'B', title: 'Interview consistency', desc: 'When every interviewer asks different questions and uses different criteria, the decision defaults to gut feel. Good candidates get lost. Poor fits get through.' },
  { id: 'C', title: 'Process speed', desc: 'The best candidates are in multiple processes simultaneously. A slow-moving hiring process doesn\'t just lose candidates — it signals how the business runs.' },
  { id: 'D', title: 'Offer management', desc: 'Offers that arrive late, underprepared, or inconsistent with what was discussed during interviews are the most preventable cause of candidate drop-off.' },
  { id: 'E', title: 'Onboarding', desc: 'Hiring doesn\'t end at an accepted offer. The first 90 days determine whether the investment in finding someone actually pays off.' },
];

export default function SmartHiringSystemPage() {
  return (
    <>
      <RevealScript />

      {/* Hero */}
      <section style={{ background: 'var(--color-void)', position: 'relative', overflow: 'hidden', paddingTop: '6rem', paddingBottom: '6rem' }}>
        <div className="hero-orb" style={{ width: 500, height: 500, top: '-10%', left: '-5%', background: 'radial-gradient(circle, rgba(123,47,190,0.18) 0%, transparent 70%)' }} />
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '4rem 2rem', position: 'relative', zIndex: 1 }}>
          {/* Breadcrumb */}
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden>›</span>
            <span>Smart Hiring System™</span>
          </nav>

          <div style={{ maxWidth: 720 }}>
            <span className="section-label">SMART HIRING SYSTEM™</span>
            <h1 style={{
              fontFamily: 'var(--font-display)', fontWeight: 900,
              fontSize: 'var(--text-display)', letterSpacing: '-0.03em', lineHeight: 1.05,
              color: 'var(--color-text-primary)', marginBottom: '1.5rem',
            }}>
              Most hiring fails<br />
              <span className="gradient-text">before the first interview</span>
            </h1>
            <p style={{ fontSize: 'var(--text-large)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)', marginBottom: '2.5rem', maxWidth: 580 }}>
              The Smart Hiring System™ scores your hiring process against five proven failure points — so you can see exactly where you&apos;re losing candidates, wasting budget, and making the same mistakes.
            </p>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <Link href="/smart-hiring-system/score" className="btn-primary">Score your hiring process →</Link>
              <Link href="/contact" className="btn-secondary">Talk to Ravello HR</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Five failure points */}
      <section style={{ background: 'var(--color-deep)' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '7rem 2rem' }}>
          <span className="section-label" data-reveal>THE FIVE FAILURE POINTS</span>
          <h2 data-reveal style={{
            fontFamily: 'var(--font-display)', fontWeight: 900,
            fontSize: 'var(--text-h2)', color: 'var(--color-text-primary)',
            letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: '4rem', maxWidth: 600,
          }}>
            Five places where hiring breaks — most businesses have problems with all of them
          </h2>

          <div data-reveal-stagger style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {FAILURE_POINTS.map(fp => (
              <div key={fp.id} className="feature-tile" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2rem', alignItems: 'start' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 8, flexShrink: 0,
                  background: 'rgba(123,47,190,0.15)', border: '1px solid rgba(123,47,190,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-purple-light)',
                  fontSize: '0.875rem',
                }}>
                  {fp.id}
                </div>
                <div>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', color: 'var(--color-text-primary)', marginBottom: '0.5rem' }}>{fp.title}</h3>
                  <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)' }}>{fp.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How the diagnostic works */}
      <section style={{ background: 'var(--color-light-bg)' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '7rem 2rem' }}>
          <span className="section-label-dark section-label" data-reveal style={{ color: 'var(--color-purple)' }}>HOW IT WORKS</span>
          <h2 data-reveal style={{
            fontFamily: 'var(--font-display)', fontWeight: 900,
            fontSize: 'var(--text-h2)', color: 'var(--color-text-dark)',
            letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: '4rem', maxWidth: 560,
          }}>
            A score in 3 minutes, a clear action plan to act on
          </h2>

          <div data-reveal-stagger style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem' }}>
            {[
              { step: '01', title: 'Answer five questions', desc: 'One focused question per failure point. No ambiguity, no HR jargon. Just a direct diagnostic of what\'s working and what isn\'t.' },
              { step: '02', title: 'Get your score', desc: 'Your hiring process is scored across all five failure points. You\'ll see exactly where you\'re strong and where you\'re haemorrhaging candidates.' },
              { step: '03', title: 'See your gaps', desc: 'A personalised summary of your three highest-priority fixes, with a clear recommendation for each. Actionable from day one.' },
            ].map(s => (
              <div key={s.step} className="card-light">
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '2rem', fontWeight: 700, color: 'var(--color-purple-light)', display: 'block', marginBottom: '1rem', opacity: 0.4 }}>{s.step}</span>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', color: 'var(--color-text-dark)', marginBottom: '0.75rem' }}>{s.title}</h3>
                <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-dark-secondary)', lineHeight: 'var(--leading-relaxed)' }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mock results preview */}
      <section style={{ background: 'var(--color-void)' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto', padding: '7rem 2rem' }}>
          <span className="section-label" data-reveal>WHAT YOU GET</span>
          <h2 data-reveal style={{
            fontFamily: 'var(--font-display)', fontWeight: 900,
            fontSize: 'var(--text-h2)', color: 'var(--color-text-primary)',
            letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: '3rem',
          }}>
            Your hiring score report looks like this
          </h2>

          <div data-reveal style={{
            background: 'var(--color-deep)', border: '1px solid rgba(123,47,190,0.3)',
            borderRadius: 16, padding: '2.5rem', position: 'relative',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(135deg, #7B2FBE, #4B6EF5, #E040A0)', borderRadius: '16px 16px 0 0' }} />

            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2.5rem', alignItems: 'start', marginBottom: '2rem' }}>
              <div>
                <p style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>OVERALL SCORE</p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: '4rem', fontFamily: 'var(--font-mono)', fontWeight: 700, background: 'linear-gradient(135deg, #A855F7, #6366F1, #EC4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>34</span>
                  <span style={{ fontSize: 18, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>/100</span>
                </div>
                <span className="badge-risk-high" style={{ marginTop: 8 }}>High risk</span>
              </div>
              <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)', marginTop: '0.5rem' }}>
                Your hiring process has critical gaps in three of the five failure points. The biggest losses are happening at brief quality and onboarding — both are fixable within 30 days.
              </p>
            </div>

            {FAILURE_POINTS.map((fp, i) => {
              const scores = [20, 45, 65, 55, 18];
              const score = scores[i];
              const color = score < 35 ? '#EF4444' : score < 60 ? '#F59E0B' : '#10B981';
              return (
                <div key={fp.id} style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)' }}>{fp.title}</span>
                    <span style={{ fontSize: 'var(--text-small)', fontFamily: 'var(--font-mono)', color }}>{score}/100</span>
                  </div>
                  <div className="score-bar-track">
                    <div style={{ height: '100%', width: `${score}%`, background: color, borderRadius: 4, opacity: 0.8 }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div data-reveal style={{ textAlign: 'center', marginTop: '3rem' }}>
            <Link href="/smart-hiring-system/score" className="btn-primary" style={{ fontSize: '1rem', padding: '1rem 2.5rem' }}>
              Take the score check — 3 minutes →
            </Link>
          </div>
        </div>
      </section>

      {/* Cross-sell */}
      <section style={{ background: 'var(--color-deep)', borderTop: '1px solid var(--color-border)' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '5rem 2rem' }}>
          <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>Also from Ravello HR</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <Link href="/policysafe" className="cross-sell-card">
              <span className="section-label" style={{ marginBottom: '0.5rem' }}>POLICYSAFE™</span>
              <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--color-text-primary)' }}>Check your compliance gaps</p>
              <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)' }}>Run a people document healthcheck →</p>
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
