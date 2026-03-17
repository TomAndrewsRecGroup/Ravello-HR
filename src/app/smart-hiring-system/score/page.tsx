'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import Link from 'next/link';

const QUESTIONS = [
  {
    id: 'brief',
    label: 'JOB BRIEF',
    question: 'Before your last three hires, did you write a detailed brief covering the specific outputs expected from the role — not just a job description?',
    options: [
      { value: 'yes',     label: 'Yes — we had a clear, detailed brief every time', score: 100 },
      { value: 'mostly',  label: 'Sometimes — depends on the role or the urgency',  score: 50 },
      { value: 'no',      label: 'No — we generally worked from a job description or nothing', score: 10 },
    ],
  },
  {
    id: 'interview',
    label: 'INTERVIEW PROCESS',
    question: 'Is there a consistent set of questions and evaluation criteria that every interviewer uses — or does each person decide what to ask on the day?',
    options: [
      { value: 'yes',     label: 'Yes — structured process with shared criteria',   score: 100 },
      { value: 'partial', label: 'Partially — some structure but inconsistent',      score: 45 },
      { value: 'no',      label: 'No — each interviewer does their own thing',       score: 5  },
    ],
  },
  {
    id: 'speed',
    label: 'PROCESS SPEED',
    question: 'From first interview to offer, how long does your hiring process typically take?',
    options: [
      { value: 'fast',   label: 'Under 2 weeks',        score: 100 },
      { value: 'medium', label: '2–4 weeks',             score: 60 },
      { value: 'slow',   label: 'Over a month',          score: 15 },
    ],
  },
  {
    id: 'offer',
    label: 'OFFER MANAGEMENT',
    question: 'When making an offer, do you have a clear process for what gets offered, how it\'s communicated, and how you handle negotiation?',
    options: [
      { value: 'yes',     label: 'Yes — clear process every time',             score: 100 },
      { value: 'partial', label: 'Loosely — it varies by hiring manager',       score: 40 },
      { value: 'no',      label: 'No — we figure it out as we go',             score: 5  },
    ],
  },
  {
    id: 'onboarding',
    label: 'ONBOARDING',
    question: 'Do new hires have a structured 30/60/90 day plan with clear milestones — or does onboarding mostly mean showing them where things are?',
    options: [
      { value: 'yes',     label: 'Yes — structured plan for every hire',        score: 100 },
      { value: 'partial', label: 'Some roles have it, not all',                 score: 45 },
      { value: 'no',      label: 'No — onboarding is informal and ad hoc',     score: 10 },
    ],
  },
];

const LABELS = ['brief', 'interview', 'speed', 'offer', 'onboarding'];
const TITLES = ['Job brief quality', 'Interview consistency', 'Process speed', 'Offer management', 'Onboarding'];

export default function SmartHiringScorePage() {
  const [step,    setStep]    = useState(0);  // 0–4 = questions, 5 = gate, 6 = results
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [email,   setEmail]   = useState('');
  const [name,    setName]    = useState('');
  const [gateErr, setGateErr] = useState('');
  const [animDir, setAnimDir] = useState<'in' | 'out'>('in');

  const isGate    = step === 5;
  const isResults = step === 6;
  const totalScore = Object.values(answers).reduce((a, b) => a + b, 0) / QUESTIONS.length;
  const roundedScore = Math.round(totalScore);

  function selectAnswer(value: string, score: number) {
    const q = QUESTIONS[step];
    setAnimDir('out');
    setTimeout(() => {
      setAnswers(prev => ({ ...prev, [q.id]: score }));
      setStep(s => s + 1);
      setAnimDir('in');
    }, 250);
  }

  function submitGate(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes('@')) { setGateErr('Please enter a valid email address.'); return; }
    setStep(6);
  }

  const riskBand = roundedScore < 35 ? { label: 'High risk', color: '#EF4444', bg: 'rgba(239,68,68,0.12)' }
    : roundedScore < 65 ? { label: 'Moderate risk', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' }
    : { label: 'Low risk', color: '#10B981', bg: 'rgba(16,185,129,0.12)' };

  return (
    <section style={{ background: 'var(--color-void)', minHeight: '100vh', paddingTop: '4rem', paddingBottom: '6rem' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '0 2rem' }}>

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" style={{ marginBottom: '2rem' }}>
          <ol style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', listStyle: 'none', padding: 0, margin: 0 }}>
            <li><Link href="/" style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-muted)', textDecoration: 'none' }}>Home</Link></li>
            <li style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-small)' }}>›</li>
            <li><Link href="/smart-hiring-system" style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-muted)', textDecoration: 'none' }}>Smart Hiring System™</Link></li>
            <li style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-small)' }}>›</li>
            <li style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)' }}>Take the Score Check</li>
          </ol>
        </nav>

        {/* Progress pips */}
        {!isResults && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: '3rem' }}>
            {QUESTIONS.map((_, i) => (
              <div
                key={i}
                className={`progress-pip ${i < step ? 'complete' : i === step ? 'active' : ''}`}
              />
            ))}
          </div>
        )}

        {/* Question step */}
        {!isGate && !isResults && (
          <div key={step} className={animDir === 'out' ? 'step-exit' : 'step-enter'}>
            <div className="card" style={{ padding: '2.5rem' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-purple-light)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', display: 'block', marginBottom: '1.25rem' }}>
                {QUESTIONS[step].label} — QUESTION {step + 1} OF {QUESTIONS.length}
              </span>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.4rem', color: 'var(--color-text-primary)', lineHeight: 1.3, marginBottom: '2rem' }}>
                {QUESTIONS[step].question}
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {QUESTIONS[step].options.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => selectAnswer(opt.value, opt.score)}
                    style={{
                      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                      borderRadius: 8, padding: '1rem 1.25rem', textAlign: 'left',
                      color: 'var(--color-text-secondary)', fontFamily: 'var(--font-body)',
                      fontSize: 'var(--text-small)', cursor: 'pointer', lineHeight: 1.5,
                      transition: 'border-color 0.2s ease, background 0.2s ease, color 0.2s ease',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'rgba(123,47,190,0.5)';
                      e.currentTarget.style.background   = 'rgba(123,47,190,0.06)';
                      e.currentTarget.style.color        = 'var(--color-text-primary)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--color-border)';
                      e.currentTarget.style.background   = 'var(--color-surface)';
                      e.currentTarget.style.color        = 'var(--color-text-secondary)';
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Email gate */}
        {isGate && (
          <div className="step-enter">
            <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: 12, margin: '0 auto 1.5rem', background: 'rgba(123,47,190,0.15)', border: '1px solid rgba(123,47,190,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>📊</div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.5rem', color: 'var(--color-text-primary)', marginBottom: '0.75rem' }}>Your score is ready</h2>
              <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)', marginBottom: '2rem' }}>
                Enter your details below to see your full score report, five failure point breakdown, and personalised recommendations.
              </p>

              <form onSubmit={submitGate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'left' }}>
                <div>
                  <label className="label" htmlFor="name">First name</label>
                  <input id="name" className="input" type="text" placeholder="Your first name" value={name} onChange={e => setName(e.target.value)} required />
                </div>
                <div>
                  <label className="label" htmlFor="email">Work email</label>
                  <input id="email" className="input" type="email" placeholder="you@company.com" value={email} onChange={e => { setEmail(e.target.value); setGateErr(''); }} required />
                  {gateErr && <p style={{ color: '#FCA5A5', fontSize: 'var(--text-xs)', marginTop: 4 }}>{gateErr}</p>}
                </div>
                <button type="submit" className="btn-primary" style={{ justifyContent: 'center', marginTop: '0.5rem' }}>
                  See my hiring score →
                </button>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                  No spam. Ravello HR will send your score report — that&apos;s it.
                </p>
              </form>
            </div>
          </div>
        )}

        {/* Results */}
        {isResults && (
          <div className="step-enter">
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.5rem', color: 'var(--color-text-primary)', textAlign: 'center', marginBottom: '0.5rem' }}>
              Your hiring score report, {name || 'there'}
            </h1>
            <p style={{ color: 'var(--color-text-secondary)', textAlign: 'center', marginBottom: '2.5rem', fontSize: 'var(--text-small)' }}>
              Here&apos;s how your hiring process scored across the five failure points.
            </p>

            <div className="card" style={{ padding: '2.5rem', marginBottom: '1.5rem', position: 'relative' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(135deg, #7B2FBE, #4B6EF5, #E040A0)', borderRadius: '12px 12px 0 0' }} />

              {/* Overall score */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem' }}>
                <div>
                  <p style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>OVERALL SCORE</p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span className="score-number">{roundedScore}</span>
                    <span style={{ fontSize: 16, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>/100</span>
                  </div>
                </div>
                <div style={{
                  background: riskBand.bg, border: `1px solid ${riskBand.color}40`,
                  borderRadius: 8, padding: '0.5rem 1rem',
                  color: riskBand.color, fontSize: 'var(--text-small)', fontWeight: 600,
                }}>
                  {riskBand.label}
                </div>
              </div>

              {/* Per-point scores */}
              {LABELS.map((id, i) => {
                const score = answers[id] ?? 0;
                const color = score < 35 ? '#EF4444' : score < 60 ? '#F59E0B' : '#10B981';
                return (
                  <div key={id} style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)' }}>{TITLES[i]}</span>
                      <span style={{ fontSize: 'var(--text-small)', fontFamily: 'var(--font-mono)', color }}>{score}/100</span>
                    </div>
                    <div className="score-bar-track">
                      <div style={{ height: '100%', width: `${score}%`, background: color, borderRadius: 4, opacity: 0.8 }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Recommendations */}
            <div className="card" style={{ padding: '2rem', marginBottom: '2rem' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: 'var(--color-text-primary)', marginBottom: '1rem' }}>
                Your top priority fixes
              </h3>
              {LABELS
                .map((id, i) => ({ id, title: TITLES[i], score: answers[id] ?? 0 }))
                .sort((a, b) => a.score - b.score)
                .slice(0, 3)
                .map(item => (
                  <div key={item.id} style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem', alignItems: 'flex-start' }}>
                    <span className="badge-risk-high" style={{ flexShrink: 0 }}>Fix first</span>
                    <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)' }}><strong style={{ color: 'var(--color-text-primary)' }}>{item.title}</strong> — scored {item.score}/100. This is your highest-leverage improvement.</p>
                  </div>
                ))
              }
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <Link href="/contact" className="btn-primary" style={{ justifyContent: 'center' }}>
                Book a call to fix these gaps →
              </Link>
              <Link href="/smart-hiring-system" className="btn-secondary" style={{ justifyContent: 'center' }}>
                ← Back to Smart Hiring System™
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
