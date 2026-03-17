'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import Link from 'next/link';

const CHECKS = [
  { id: 'contracts',   area: 'Contracts',     question: 'Do all employees have a current, signed employment contract that reflects their actual role and terms?' },
  { id: 'handbook',    area: 'Handbook',      question: 'Is your employee handbook less than two years old and compliant with current UK employment law?' },
  { id: 'disciplinary', area: 'Disciplinary', question: 'Do you have a written disciplinary and grievance procedure that managers are trained to follow?' },
  { id: 'policies',    area: 'Policies',      question: 'Do you have documented policies for absence management, flexible working, and data protection?' },
  { id: 'managers',    area: 'Managers',      question: 'Are your managers given written guidance on how to handle performance conversations, not just verbal instructions?' },
];

const OPTIONS: { value: 'yes' | 'partial' | 'no'; label: string; risk: 'low' | 'mid' | 'high' }[] = [
  { value: 'yes',     label: 'Yes — fully in place',          risk: 'low'  },
  { value: 'partial', label: 'Partially — needs updating',    risk: 'mid'  },
  { value: 'no',      label: 'No — this is a gap',            risk: 'high' },
];

type Answer = 'yes' | 'partial' | 'no';

export default function PolicyHealthcheckPage() {
  const [step,    setStep]    = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [email,   setEmail]   = useState('');
  const [name,    setName]    = useState('');
  const [gateErr, setGateErr] = useState('');

  const isGate    = step === CHECKS.length;
  const isResults = step === CHECKS.length + 1;

  function selectAnswer(value: Answer) {
    const q = CHECKS[step];
    setAnswers(prev => ({ ...prev, [q.id]: value }));
    setTimeout(() => setStep(s => s + 1), 200);
  }

  function submitGate(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes('@')) { setGateErr('Please enter a valid email.'); return; }
    setStep(CHECKS.length + 1);
  }

  const highRisk = CHECKS.filter(c => answers[c.id] === 'no');
  const midRisk  = CHECKS.filter(c => answers[c.id] === 'partial');
  const lowRisk  = CHECKS.filter(c => answers[c.id] === 'yes');

  return (
    <section style={{ background: 'var(--color-void)', minHeight: '100vh', paddingTop: '4rem', paddingBottom: '6rem' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '0 2rem' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <span className="section-label" style={{ justifyContent: 'center', display: 'flex' }}>POLICYSAFE™</span>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.75rem', color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
            HR Compliance Healthcheck
          </h1>
        </div>

        {/* Progress pips */}
        {!isResults && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: '2.5rem' }}>
            {CHECKS.map((_, i) => (
              <div key={i} className={`progress-pip ${i < step ? 'complete' : i === step ? 'active' : ''}`} />
            ))}
          </div>
        )}

        {/* Question */}
        {!isGate && !isResults && (
          <div key={step} className="step-enter">
            <div className="card" style={{ padding: '2.5rem' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-purple-light)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', display: 'block', marginBottom: '1.25rem' }}>
                {CHECKS[step].area} — {step + 1} OF {CHECKS.length}
              </span>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.35rem', color: 'var(--color-text-primary)', lineHeight: 1.3, marginBottom: '2rem' }}>
                {CHECKS[step].question}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => selectAnswer(opt.value)}
                    style={{
                      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                      borderRadius: 8, padding: '1rem 1.25rem', textAlign: 'left',
                      color: 'var(--color-text-secondary)', fontFamily: 'var(--font-body)',
                      fontSize: 'var(--text-small)', cursor: 'pointer',
                      transition: 'border-color 0.2s ease, background 0.2s ease, color 0.2s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(123,47,190,0.5)'; e.currentTarget.style.color = 'var(--color-text-primary)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Gate */}
        {isGate && (
          <div className="step-enter">
            <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.5rem', color: 'var(--color-text-primary)', marginBottom: '0.75rem' }}>Your gap report is ready</h2>
              <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)', marginBottom: '2rem' }}>
                Enter your details to see your HIGH / MEDIUM / LOW risk breakdown and recommendations.
              </p>
              <form onSubmit={submitGate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'left' }}>
                <div>
                  <label className="label">First name</label>
                  <input className="input" type="text" placeholder="Your first name" value={name} onChange={e => setName(e.target.value)} required />
                </div>
                <div>
                  <label className="label">Work email</label>
                  <input className="input" type="email" placeholder="you@company.com" value={email} onChange={e => { setEmail(e.target.value); setGateErr(''); }} required />
                  {gateErr && <p style={{ color: '#FCA5A5', fontSize: 'var(--text-xs)', marginTop: 4 }}>{gateErr}</p>}
                </div>
                <button type="submit" className="btn-primary" style={{ justifyContent: 'center', marginTop: '0.5rem' }}>
                  See my gap report →
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Results */}
        {isResults && (
          <div className="step-enter">
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.5rem', color: 'var(--color-text-primary)', textAlign: 'center', marginBottom: '2rem' }}>
              Your compliance gap report, {name || 'there'}
            </h1>

            {highRisk.length > 0 && (
              <div className="card" style={{ padding: '1.75rem', marginBottom: '1rem', borderColor: 'rgba(239,68,68,0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <span className="badge-risk-high">HIGH RISK</span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'rgba(240,238,255,0.4)' }}>{highRisk.length} area{highRisk.length > 1 ? 's' : ''} — act immediately</span>
                </div>
                {highRisk.map(c => <p key={c.id} style={{ fontSize: 'var(--text-small)', color: '#FCA5A5', marginBottom: 4 }}>• {c.area}</p>)}
              </div>
            )}
            {midRisk.length > 0 && (
              <div className="card" style={{ padding: '1.75rem', marginBottom: '1rem', borderColor: 'rgba(245,158,11,0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <span className="badge-risk-mid">MEDIUM RISK</span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'rgba(240,238,255,0.4)' }}>{midRisk.length} area{midRisk.length > 1 ? 's' : ''} — review within 90 days</span>
                </div>
                {midRisk.map(c => <p key={c.id} style={{ fontSize: 'var(--text-small)', color: '#FCD34D', marginBottom: 4 }}>• {c.area}</p>)}
              </div>
            )}
            {lowRisk.length > 0 && (
              <div className="card" style={{ padding: '1.75rem', marginBottom: '1rem', borderColor: 'rgba(16,185,129,0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <span className="badge-risk-low">LOW RISK</span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'rgba(240,238,255,0.4)' }}>{lowRisk.length} area{lowRisk.length > 1 ? 's' : ''} — maintain and review annually</span>
                </div>
                {lowRisk.map(c => <p key={c.id} style={{ fontSize: 'var(--text-small)', color: '#6EE7B7', marginBottom: 4 }}>• {c.area}</p>)}
              </div>
            )}

            <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <Link href="/contact" className="btn-primary" style={{ justifyContent: 'center' }}>Book a review call →</Link>
              <Link href="/policysafe" className="btn-secondary" style={{ justifyContent: 'center' }}>View PolicySafe™ packages</Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
