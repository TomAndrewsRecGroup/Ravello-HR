'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import Link from 'next/link';

const RISK_QUESTIONS = [
  { id: 'liabilities',   theme: 'Employment Liabilities', question: 'Are you confident that all employment contracts in the target business are current, signed, and reflect actual terms of employment?' },
  { id: 'keyperson',     theme: 'Key Person Dependency',  question: 'Could the business continue operating at full capacity if its two most senior non-founder employees left within 30 days of completion?' },
  { id: 'culture',       theme: 'Culture Risk',           question: 'Do the leadership styles and operational cultures of both businesses align closely enough to integrate without significant friction?' },
  { id: 'integration',   theme: 'Integration Planning',   question: 'Is there a detailed first-90-days integration plan covering people, communications, and management changes?' },
  { id: 'compliance',    theme: 'Compliance Alignment',   question: 'Has a compliance review confirmed the target business meets UK employment law requirements across all entities?' },
];

type Answer = 'yes' | 'no' | 'unsure';

export default function DealReadyPreCheckPage() {
  const [step,    setStep]    = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [email,   setEmail]   = useState('');
  const [name,    setName]    = useState('');
  const [gateErr, setGateErr] = useState('');

  const isGate    = step === RISK_QUESTIONS.length;
  const isResults = step === RISK_QUESTIONS.length + 1;

  function selectAnswer(value: Answer) {
    const q = RISK_QUESTIONS[step];
    setAnswers(prev => ({ ...prev, [q.id]: value }));
    setTimeout(() => setStep(s => s + 1), 200);
  }

  function submitGate(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes('@')) { setGateErr('Please enter a valid email address.'); return; }
    setStep(RISK_QUESTIONS.length + 1);
  }

  const redItems    = RISK_QUESTIONS.filter(q => answers[q.id] === 'no');
  const amberItems  = RISK_QUESTIONS.filter(q => answers[q.id] === 'unsure');
  const greenItems  = RISK_QUESTIONS.filter(q => answers[q.id] === 'yes');

  const overallRag = redItems.length >= 2 ? 'RED'
    : redItems.length === 1 || amberItems.length >= 2 ? 'AMBER'
    : 'GREEN';

  const ragColors: Record<string, { bg: string; color: string; label: string }> = {
    RED:   { bg: 'rgba(239,68,68,0.12)',    color: '#FCA5A5', label: 'High people risk' },
    AMBER: { bg: 'rgba(245,158,11,0.12)',   color: '#FCD34D', label: 'Moderate people risk' },
    GREEN: { bg: 'rgba(16,185,129,0.12)',   color: '#6EE7B7', label: 'Lower people risk' },
  };

  return (
    <section style={{ background: 'var(--color-void)', minHeight: '100vh', paddingTop: '4rem', paddingBottom: '6rem' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '0 2rem' }}>

        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <span className="section-label" style={{ justifyContent: 'center', display: 'flex' }}>DEALREADY PEOPLE™</span>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.75rem', color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
            People Risk Pre-Check
          </h1>
        </div>

        {/* Progress pips */}
        {!isResults && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: '2.5rem' }}>
            {RISK_QUESTIONS.map((_, i) => (
              <div key={i} className={`progress-pip ${i < step ? 'complete' : i === step ? 'active' : ''}`} />
            ))}
          </div>
        )}

        {/* Question */}
        {!isGate && !isResults && (
          <div key={step} className="step-enter">
            <div className="card" style={{ padding: '2.5rem' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-purple-light)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', display: 'block', marginBottom: '1.25rem' }}>
                {RISK_QUESTIONS[step].theme} — {step + 1} OF {RISK_QUESTIONS.length}
              </span>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.35rem', color: 'var(--color-text-primary)', lineHeight: 1.3, marginBottom: '2rem' }}>
                {RISK_QUESTIONS[step].question}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {(['yes', 'no', 'unsure'] as Answer[]).map(opt => (
                  <button
                    key={opt}
                    onClick={() => selectAnswer(opt)}
                    style={{
                      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                      borderRadius: 8, padding: '1rem 1.25rem', textAlign: 'left',
                      color: 'var(--color-text-secondary)', fontFamily: 'var(--font-body)',
                      fontSize: 'var(--text-small)', cursor: 'pointer',
                      transition: 'border-color 0.2s ease, color 0.2s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(123,47,190,0.5)'; e.currentTarget.style.color = 'var(--color-text-primary)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
                  >
                    {opt === 'yes' ? 'Yes — confident this is in order' : opt === 'no' ? 'No — this is a gap or unknown' : 'Not sure — needs investigation'}
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
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.5rem', color: 'var(--color-text-primary)', marginBottom: '0.75rem' }}>Your risk report is ready</h2>
              <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)', marginBottom: '2rem' }}>
                Enter your details to see your RAG risk assessment across all five people-risk themes.
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
                  See my risk report →
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Results */}
        {isResults && (
          <div className="step-enter">
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.5rem', color: 'var(--color-text-primary)', textAlign: 'center', marginBottom: '2rem' }}>
              People risk report, {name || 'there'}
            </h1>

            {/* Overall RAG */}
            <div className="card" style={{ padding: '1.75rem', marginBottom: '1.5rem', borderColor: `${ragColors[overallRag].color}40`, background: ragColors[overallRag].bg }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: ragColors[overallRag].color, flexShrink: 0 }} />
                <div>
                  <p style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: ragColors[overallRag].color }}>{overallRag} — {ragColors[overallRag].label}</p>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Overall deal readiness rating across five people-risk themes</p>
                </div>
              </div>
            </div>

            {/* Per-theme */}
            <div className="card" style={{ padding: '1.75rem', marginBottom: '1.5rem' }}>
              {RISK_QUESTIONS.map(q => {
                const ans = answers[q.id];
                const color = ans === 'yes' ? '#10B981' : ans === 'no' ? '#EF4444' : '#F59E0B';
                const label = ans === 'yes' ? 'GREEN' : ans === 'no' ? 'RED' : 'AMBER';
                return (
                  <div key={q.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0', borderBottom: '1px solid var(--color-border)' }}>
                    <span style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)' }}>{q.theme}</span>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{label}</span>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <Link href="/contact" className="btn-primary" style={{ justifyContent: 'center' }}>Book a confidential consultation →</Link>
              <Link href="/dealready-people/checklist" className="btn-secondary" style={{ justifyContent: 'center' }}>Download the full DD checklist</Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
