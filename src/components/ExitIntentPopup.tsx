'use client';
import { useEffect, useState } from 'react';
import { X, Download, ArrowRight } from 'lucide-react';

const STORAGE_KEY = 'ravello_exit_dismissed';

export default function ExitIntentPopup() {
  const [visible, setVisible] = useState(false);
  const [email, setEmail]     = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(STORAGE_KEY)) return;

    const handleMouseOut = (e: MouseEvent) => {
      if (e.clientY <= 20 && !sessionStorage.getItem(STORAGE_KEY)) {
        setVisible(true);
      }
    };

    // Also show after 45s idle as fallback for mobile
    const timer = setTimeout(() => {
      if (!sessionStorage.getItem(STORAGE_KEY)) setVisible(true);
    }, 45000);

    document.addEventListener('mouseleave', handleMouseOut);
    return () => {
      document.removeEventListener('mouseleave', handleMouseOut);
      clearTimeout(timer);
    };
  }, []);

  const dismiss = () => {
    sessionStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    // TODO: wire to your email provider (Resend / Make webhook)
    // await fetch('/api/leads', { method: 'POST', body: JSON.stringify({ email, source: 'exit_intent' }) });
    setSubmitted(true);
    sessionStorage.setItem(STORAGE_KEY, '1');
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(7,11,29,0.75)', backdropFilter: 'blur(8px)', animation: 'fadeIn 0.25s ease' }}
      onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <div
        className="relative w-full max-w-[520px] rounded-[28px] overflow-hidden"
        style={{ background: 'var(--bg)', boxShadow: '0 24px 80px rgba(13,21,53,0.28)', animation: 'fadeUp 0.3s ease' }}
      >
        {/* Gradient top bar */}
        <div className="h-1" style={{ background: 'var(--gradient)' }} />

        {/* Close */}
        <button
          onClick={dismiss}
          className="absolute top-5 right-5 w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--surface-alt)]"
          style={{ color: 'var(--ink-faint)' }}
        >
          <X size={16} />
        </button>

        <div className="p-10">
          {!submitted ? (
            <>
              {/* Icon */}
              <div
                className="w-14 h-14 rounded-[16px] flex items-center justify-center mb-7"
                style={{ background: 'rgba(124,58,237,0.09)', border: '1px solid rgba(124,58,237,0.20)' }}
              >
                <Download size={24} style={{ color: 'var(--brand-purple)' }} />
              </div>

              <p className="eyebrow mb-4">Free guide: takes 5 minutes to read</p>
              <h2
                className="font-bold mb-4"
                style={{ fontSize: 'clamp(1.5rem,3vw,2rem)', color: 'var(--ink)', letterSpacing: '-0.02em' }}
              >
                The exact 4-step framework that stops roles reopening
              </h2>
              <p className="text-sm leading-relaxed mb-8" style={{ color: 'var(--ink-soft)' }}>
                Every role that reopens costs 3x what a structured hire would. This free guide shows you the exact pattern, plus the 4-step process 100+ UK businesses have used to fix it for good.
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
                <button type="submit" className="btn-gradient w-full">
                  Send me the guide <ArrowRight size={15} />
                </button>
              </form>

              <p className="text-xs mt-4 text-center" style={{ color: 'var(--ink-faint)' }}>
                No spam. Unsubscribe anytime.
              </p>
            </>
          ) : (
            <div className="text-center py-6">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
                style={{ background: 'rgba(124,58,237,0.09)' }}
              >
                <span className="text-3xl">✓</span>
              </div>
              <h3 className="font-bold text-xl mb-3" style={{ color: 'var(--ink)' }}>It is on its way.</h3>
              <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                Check your inbox. The Hiring Drift Framework will be with you shortly.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
