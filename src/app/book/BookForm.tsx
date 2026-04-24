'use client';

import { useState } from 'react';
import { ArrowRight, CheckCircle2, Briefcase, ShieldCheck, Handshake, Loader2 } from 'lucide-react';

type Challenge = 'hiring' | 'foundations' | 'deal';

const CHALLENGES: { id: Challenge; label: string; desc: string; icon: typeof Briefcase; color: string; ring: string }[] = [
  {
    id: 'hiring',
    label: 'I need help hiring',
    desc: 'A role that keeps reopening, rising agency spend, or a process that moves too slowly.',
    icon: Briefcase,
    color: 'var(--brand-purple)',
    ring: 'rgba(124,58,237,0.12)',
  },
  {
    id: 'foundations',
    label: 'I need HR foundations',
    desc: 'Missing contracts, an outdated handbook, or Employment Rights Bill gaps.',
    icon: ShieldCheck,
    color: 'var(--brand-blue)',
    ring: 'rgba(59,111,255,0.12)',
  },
  {
    id: 'deal',
    label: "I'm going through a deal",
    desc: 'An acquisition, merger, TUPE transfer, or restructure needing a people review.',
    icon: Handshake,
    color: 'var(--brand-pink)',
    ring: 'rgba(234,61,196,0.12)',
  },
];

const COMPANY_SIZES = ['Under 10', '10-50', '50-250', '250+'];

const INPUT_CLS =
  'w-full px-4 py-3 rounded-[12px] text-[var(--ink)] placeholder:text-[var(--ink-faint)] ' +
  'focus:outline-none focus:ring-2 focus:ring-[var(--brand-purple)] focus:ring-offset-1 focus:border-transparent ' +
  'transition-shadow';

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--brand-line)',
  fontSize: '0.95rem',
};

const LABEL_CLS = 'block text-xs font-semibold mb-2';
const LABEL_STYLE: React.CSSProperties = { color: 'var(--ink-soft)', letterSpacing: '0.02em' };

export default function BookForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [challenge, setChallenge] = useState<Challenge | ''>('');
  const [companySize, setCompanySize] = useState('');
  const [situation, setSituation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name || !email || !company || !phone || !challenge) {
      setError('Please fill in your name, email, company, phone, and which challenge fits.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          company,
          source: 'book-form',
          problemType: challenge,
          metadata: {
            phone,
            companySize: companySize || null,
            situation: situation || null,
          },
        }),
      });
      if (!res.ok) throw new Error('Submission failed');
      setSubmitted(true);
    } catch {
      setError('Something went wrong. Please try again or email info@thepeoplesystem.co.uk.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div
        className="rounded-[20px] p-8 lg:p-10 text-center"
        style={{ background: 'var(--surface)', border: '1px solid var(--brand-line)', boxShadow: '0 4px 24px rgba(14,22,51,0.06)' }}
      >
        <div
          className="w-14 h-14 rounded-full mx-auto mb-5 flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, var(--brand-purple), var(--brand-blue))' }}
        >
          <CheckCircle2 size={28} className="text-white" />
        </div>
        <h2 className="text-2xl font-bold mb-3" style={{ color: 'var(--ink)' }}>
          Got it. We&apos;ll be in touch.
        </h2>
        <p className="text-sm leading-relaxed mb-6 max-w-[420px] mx-auto" style={{ color: 'var(--ink-soft)' }}>
          Lucy or Tom will reply within one business day to set a time that works.
          Check your inbox: if you don&apos;t hear back, drop us a note at{' '}
          <a href="mailto:info@thepeoplesystem.co.uk" style={{ color: 'var(--brand-purple)' }}>
            info@thepeoplesystem.co.uk
          </a>
          .
        </p>
        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          In the meantime, you might find the free tools useful.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[20px] p-6 lg:p-8"
      style={{ background: 'var(--surface)', border: '1px solid var(--brand-line)', boxShadow: '0 4px 24px rgba(14,22,51,0.06)' }}
    >
      <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--ink)' }}>
        Tell us about your challenge
      </h2>
      <p className="text-sm mb-6" style={{ color: 'var(--ink-soft)' }}>
        Send us the form. Lucy or Tom will be back in touch within one business day to set a time.
      </p>

      {/* Challenge selector */}
      <label className={LABEL_CLS} style={LABEL_STYLE}>
        Which challenge fits? <span style={{ color: 'var(--brand-pink)' }}>*</span>
      </label>
      <div className="grid sm:grid-cols-3 gap-3 mb-6">
        {CHALLENGES.map((c) => {
          const Icon = c.icon;
          const active = challenge === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setChallenge(c.id)}
              className="text-left rounded-[14px] p-4 transition-all"
              style={{
                background: active ? c.ring : 'var(--bg)',
                border: `1px solid ${active ? c.color : 'var(--brand-line)'}`,
                boxShadow: active ? `0 0 0 3px ${c.ring}` : 'none',
              }}
            >
              <div
                className="w-9 h-9 rounded-[10px] flex items-center justify-center mb-3"
                style={{ background: active ? 'var(--surface)' : c.ring }}
              >
                <Icon size={16} style={{ color: c.color }} />
              </div>
              <p className="font-semibold text-[13px] mb-1" style={{ color: 'var(--ink)' }}>
                {c.label}
              </p>
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                {c.desc}
              </p>
            </button>
          );
        })}
      </div>

      {/* Name + email */}
      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label htmlFor="bf-name" className={LABEL_CLS} style={LABEL_STYLE}>
            Your name <span style={{ color: 'var(--brand-pink)' }}>*</span>
          </label>
          <input
            id="bf-name"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={INPUT_CLS}
            style={INPUT_STYLE}
            placeholder="Jane Smith"
          />
        </div>
        <div>
          <label htmlFor="bf-email" className={LABEL_CLS} style={LABEL_STYLE}>
            Work email <span style={{ color: 'var(--brand-pink)' }}>*</span>
          </label>
          <input
            id="bf-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={INPUT_CLS}
            style={INPUT_STYLE}
            placeholder="jane@company.com"
          />
        </div>
      </div>

      {/* Company + phone */}
      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label htmlFor="bf-company" className={LABEL_CLS} style={LABEL_STYLE}>
            Company <span style={{ color: 'var(--brand-pink)' }}>*</span>
          </label>
          <input
            id="bf-company"
            type="text"
            autoComplete="organization"
            required
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className={INPUT_CLS}
            style={INPUT_STYLE}
            placeholder="Acme Ltd"
          />
        </div>
        <div>
          <label htmlFor="bf-phone" className={LABEL_CLS} style={LABEL_STYLE}>
            Phone <span style={{ color: 'var(--brand-pink)' }}>*</span>
          </label>
          <input
            id="bf-phone"
            type="tel"
            autoComplete="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={INPUT_CLS}
            style={INPUT_STYLE}
            placeholder="+44 7…"
          />
        </div>
      </div>

      {/* Company size */}
      <div className="mb-4">
        <label htmlFor="bf-size" className={LABEL_CLS} style={LABEL_STYLE}>
          Company size <span style={{ color: 'var(--ink-faint)' }}>(optional)</span>
        </label>
        <select
          id="bf-size"
          value={companySize}
          onChange={(e) => setCompanySize(e.target.value)}
          className={INPUT_CLS}
          style={INPUT_STYLE}
        >
          <option value="">Select size</option>
          {COMPANY_SIZES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Situation */}
      <div className="mb-6">
        <label htmlFor="bf-situation" className={LABEL_CLS} style={LABEL_STYLE}>
          Tell us a bit about the situation <span style={{ color: 'var(--ink-faint)' }}>(optional)</span>
        </label>
        <textarea
          id="bf-situation"
          rows={4}
          value={situation}
          onChange={(e) => setSituation(e.target.value)}
          className={INPUT_CLS}
          style={{ ...INPUT_STYLE, resize: 'vertical', minHeight: 110 }}
          placeholder="A sentence or two is plenty. What is the role, the gap, or the deal?"
        />
      </div>

      {error && (
        <div
          className="rounded-[10px] px-3 py-2 mb-4 text-sm"
          style={{ background: 'rgba(217,68,68,0.08)', color: '#B32D2D', border: '1px solid rgba(217,68,68,0.2)' }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="btn-gradient w-full justify-center"
        style={{ opacity: submitting ? 0.7 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}
      >
        {submitting ? (
          <>
            Sending <Loader2 size={15} className="animate-spin" />
          </>
        ) : (
          <>
            Send and book a call <ArrowRight size={15} />
          </>
        )}
      </button>

      <p className="text-xs mt-4 text-center" style={{ color: 'var(--ink-faint)' }}>
        We will reply within one business day. Prefer email?{' '}
        <a href="mailto:info@thepeoplesystem.co.uk" style={{ color: 'var(--brand-purple)' }}>
          info@thepeoplesystem.co.uk
        </a>
      </p>
    </form>
  );
}
