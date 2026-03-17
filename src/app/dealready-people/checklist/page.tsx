'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import Link from 'next/link';

export default function DealReadyChecklistPage() {
  const [name,      setName]      = useState('');
  const [email,     setEmail]     = useState('');
  const [company,   setCompany]   = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error,     setError]     = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes('@')) { setError('Please enter a valid email address.'); return; }
    setSubmitted(true);
  }

  const ITEMS = [
    'Employment contract review template', 'Key person dependency mapping framework',
    'Culture integration readiness assessment', 'TUPE considerations checklist',
    'First 90 days integration planner', 'HR compliance alignment tracker',
    'Retention risk identification tool', 'M&A communication planning guide',
  ];

  return (
    <section style={{ background: 'var(--color-void)', minHeight: '100vh', paddingTop: '4rem', paddingBottom: '6rem' }}>
      <div style={{ maxWidth: '580px', margin: '0 auto', padding: '0 2rem' }}>
        <nav className="breadcrumb" style={{ marginBottom: '3rem' }} aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span>›</span>
          <Link href="/dealready-people">DealReady People™</Link>
          <span>›</span>
          <span>DD Checklist</span>
        </nav>

        {!submitted ? (
          <div className="card" style={{ padding: '2.5rem' }}>
            <div style={{ width: 52, height: 52, borderRadius: 10, background: 'rgba(224,64,160,0.15)', border: '1px solid rgba(224,64,160,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: '1.5rem' }}>📋</div>
            <span className="section-label" style={{ marginBottom: '0.75rem' }}>FREE DOWNLOAD</span>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.75rem', color: 'var(--color-text-primary)', letterSpacing: '-0.02em', marginBottom: '1rem', lineHeight: 1.2 }}>
              People Due Diligence Checklist
            </h1>
            <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)', marginBottom: '1.25rem' }}>
              A comprehensive checklist for people due diligence across pre and post-acquisition phases — built for PE firms, acquirers, and advisors conducting M&A transactions in the UK.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, marginBottom: '2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {ITEMS.map(item => (
                <li key={item} style={{ display: 'flex', gap: '0.5rem', fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)' }}>
                  <span style={{ color: '#10B981' }}>✓</span>{item}
                </li>
              ))}
            </ul>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="label">First name</label>
                <input className="input" type="text" placeholder="Your first name" value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div>
                <label className="label">Work email</label>
                <input className="input" type="email" placeholder="you@company.com" value={email} onChange={e => { setEmail(e.target.value); setError(''); }} required />
                {error && <p style={{ color: '#FCA5A5', fontSize: 'var(--text-xs)', marginTop: 4 }}>{error}</p>}
              </div>
              <div>
                <label className="label">Company name <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(optional)</span></label>
                <input className="input" type="text" placeholder="Your company" value={company} onChange={e => setCompany(e.target.value)} />
              </div>
              <button type="submit" className="btn-primary" style={{ justifyContent: 'center', marginTop: '0.5rem' }}>
                Download the checklist →
              </button>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                Ravello HR may follow up about your transaction — no obligation.
              </p>
            </form>
          </div>
        ) : (
          <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 1.5rem' }}>✓</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.5rem', color: 'var(--color-text-primary)', marginBottom: '0.75rem' }}>Checklist on its way</h2>
            <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)', marginBottom: '2rem' }}>
              Ravello HR will send the full DD checklist to {email} shortly.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <Link href="/contact" className="btn-primary" style={{ justifyContent: 'center' }}>Book a confidential consultation →</Link>
              <Link href="/dealready-people/pre-check" className="btn-secondary" style={{ justifyContent: 'center' }}>Run the 5-minute pre-check</Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
