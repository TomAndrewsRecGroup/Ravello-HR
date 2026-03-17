'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ContactForm() {
  const [form, setForm] = useState({ name: '', email: '', company: '', message: '', enquiry: 'scoping' });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  function set(k: string, v: string) { setForm(p => ({ ...p, [k]: v })); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email.includes('@')) { setError('Please enter a valid email address.'); return; }
    setSubmitted(true);
  }

  return (
    <section style={{ background: 'var(--color-void)', minHeight: '100vh', paddingTop: '4rem', paddingBottom: '6rem' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '4rem 2rem' }}>
        <nav className="breadcrumb"><Link href="/">Home</Link><span>›</span><span>Contact</span></nav>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5rem', alignItems: 'start' }}>
          {/* Left — copy */}
          <div>
            <span className="section-label">GET IN TOUCH</span>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'var(--text-display)', letterSpacing: '-0.03em', lineHeight: 1.05, color: 'var(--color-text-primary)', marginBottom: '1.5rem' }}>
              Book a<br /><span className="gradient-text">scoping call</span>
            </h1>
            <p style={{ fontSize: 'var(--text-large)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)', marginBottom: '3rem' }}>
              A 30-minute call to understand the specific people challenge you&apos;re facing and whether Ravello HR is the right fit to help fix it.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {[
                { icon: '📊', title: 'Not sure where to start?', desc: 'Run one of the free diagnostics first — Smart Hiring System™, PolicySafe™, or DealReady People™ — and bring your score to the call.', href: '/smart-hiring-system/score', cta: 'Score your hiring process' },
                { icon: '📄', title: 'Need a policy document first?', desc: 'Download the free starter handbook template from PolicySafe™ to benchmark where you are before the conversation.', href: '/policysafe/templates', cta: 'Get the free template' },
              ].map(item => (
                <div key={item.title} className="card" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '1rem' }}>
                  <span style={{ fontSize: 22 }}>{item.icon}</span>
                  <div>
                    <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '0.35rem', fontSize: '0.95rem' }}>{item.title}</p>
                    <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)', lineHeight: 1.5, marginBottom: '0.75rem' }}>{item.desc}</p>
                    <Link href={item.href} className="btn-text">{item.cta}</Link>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — form */}
          <div>
            {!submitted ? (
              <div className="card" style={{ padding: '2.5rem' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(135deg, #7B2FBE, #4B6EF5, #E040A0)', borderRadius: '12px 12px 0 0' }} />

                <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.25rem', color: 'var(--color-text-primary)', marginBottom: '2rem' }}>
                  Tell Ravello HR what you&apos;re working on
                </h2>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', position: 'relative' }}>
                  <div>
                    <label className="label">Enquiry type</label>
                    <select
                      className="input"
                      value={form.enquiry}
                      onChange={e => set('enquiry', e.target.value)}
                      style={{ appearance: 'none' }}
                    >
                      <option value="scoping">Scoping call — general enquiry</option>
                      <option value="hiring">Smart Hiring System™ — hiring support</option>
                      <option value="policy">PolicySafe™ — compliance &amp; policies</option>
                      <option value="ma">DealReady People™ — M&amp;A / due diligence</option>
                      <option value="fractional">Fractional HR Director</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label className="label">First name</label>
                      <input className="input" type="text" placeholder="Your name" value={form.name} onChange={e => set('name', e.target.value)} required />
                    </div>
                    <div>
                      <label className="label">Work email</label>
                      <input className="input" type="email" placeholder="you@company.com" value={form.email} onChange={e => { set('email', e.target.value); setError(''); }} required />
                    </div>
                  </div>
                  <div>
                    <label className="label">Company name <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(optional)</span></label>
                    <input className="input" type="text" placeholder="Your company" value={form.company} onChange={e => set('company', e.target.value)} />
                  </div>
                  <div>
                    <label className="label">What are you trying to fix?</label>
                    <textarea
                      className="input"
                      rows={4}
                      placeholder="Briefly describe the people challenge you're facing..."
                      value={form.message}
                      onChange={e => set('message', e.target.value)}
                      style={{ resize: 'vertical', minHeight: 100 }}
                    />
                  </div>
                  {error && <p style={{ color: '#FCA5A5', fontSize: 'var(--text-xs)' }}>{error}</p>}
                  <button type="submit" className="btn-primary" style={{ justifyContent: 'center' }}>
                    Send enquiry →
                  </button>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                    Ravello HR will respond within one business day.
                  </p>
                </form>
              </div>
            ) : (
              <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 1.5rem' }}>✓</div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.5rem', color: 'var(--color-text-primary)', marginBottom: '0.75rem' }}>Enquiry received</h2>
                <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)', marginBottom: '2rem' }}>
                  Ravello HR will respond to {form.email} within one business day to arrange a scoping call.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <Link href="/smart-hiring-system/score" className="btn-secondary" style={{ justifyContent: 'center' }}>Score your hiring process while you wait</Link>
                  <Link href="/" className="btn-text" style={{ justifyContent: 'center' }}>Back to Ravello HR</Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
