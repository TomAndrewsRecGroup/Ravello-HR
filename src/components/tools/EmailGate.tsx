'use client';
import { useState } from 'react';
import { ArrowRight, Lock } from 'lucide-react';

interface EmailGateProps {
  toolName: string;
  teaserScore?: number | string;
  teaserLabel?: string;
  onUnlock: (email: string) => void;
}

export default function EmailGate({ toolName, teaserScore, teaserLabel, onUnlock }: EmailGateProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    // TODO: POST to your email provider
    // await fetch('/api/leads', { method: 'POST', body: JSON.stringify({ email, source: toolName }) });
    await new Promise(r => setTimeout(r, 600)); // UX delay
    onUnlock(email);
  };

  return (
    <div
      className="rounded-[24px] overflow-hidden"
      style={{ border: '1px solid var(--brand-line)', boxShadow: '0 4px 32px rgba(13,21,53,0.08)' }}
    >
      {/* Teaser blurred score */}
      {teaserScore !== undefined && (
        <div
          className="relative px-8 py-10 text-center"
          style={{ background: 'var(--surface-alt)', borderBottom: '1px solid var(--brand-line)' }}
        >
          <p className="eyebrow justify-center mb-3">Your {teaserLabel ?? 'score'}</p>
          <div className="relative inline-block">
            <p
              className="font-extrabold"
              style={{
                fontSize: 'clamp(4rem,8vw,7rem)',
                background: 'var(--gradient)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                filter: 'blur(12px)',
                userSelect: 'none',
              }}
            >
              {teaserScore}
            </p>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <Lock size={28} style={{ color: 'var(--brand-purple)' }} />
              <p className="text-xs font-semibold" style={{ color: 'var(--ink-soft)' }}>Unlock your full results</p>
            </div>
          </div>
        </div>
      )}

      {/* Gate form */}
      <div className="px-8 py-8">
        <h3 className="font-bold text-xl mb-2" style={{ color: 'var(--ink)', letterSpacing: '-0.015em' }}>
          Get your full {toolName} results
        </h3>
        <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--ink-soft)' }}>
          Enter your email and we\'ll send you the complete breakdown — plus tailored next steps based on your answers.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            required
            placeholder="Your work email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-5 py-3.5 rounded-[12px] text-sm outline-none transition-all"
            style={{
              background: 'var(--surface-alt)',
              border: '1.5px solid var(--brand-line)',
              color: 'var(--ink)',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--brand-purple)')}
            onBlur={(e)  => (e.currentTarget.style.borderColor = 'var(--brand-line)')}
          />
          <button type="submit" className="btn-gradient w-full" disabled={loading}>
            {loading ? 'Sending…' : <><span>Send me my results</span> <ArrowRight size={15} /></>}
          </button>
        </form>

        <p className="text-xs mt-4 text-center" style={{ color: 'var(--ink-faint)' }}>
          No spam. Your data is handled under UK GDPR. Unsubscribe anytime.
        </p>
      </div>
    </div>
  );
}
