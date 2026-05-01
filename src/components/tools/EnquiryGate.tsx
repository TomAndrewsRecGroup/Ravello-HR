'use client';
import { useState } from 'react';
import { ArrowRight, Lock, CheckCircle2 } from 'lucide-react';

export interface EnquiryFormData {
  fullName:    string;
  email:       string;
  phone:       string;
  companyName: string;
}

interface Props {
  toolName:     string;
  source:       'hiring_score' | 'hr_risk' | 'policy_healthcheck' | 'due_diligence';
  result:       Record<string, unknown>;
  teaserScore?: number | string;
  teaserLabel?: string;
  onUnlock:    (data: EnquiryFormData) => void;
}

export default function EnquiryGate({ toolName, source, result, teaserScore, teaserLabel, onUnlock }: Props) {
  const [data, setData] = useState<EnquiryFormData>({ fullName: '', email: '', phone: '', companyName: '' });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const update = (k: keyof EnquiryFormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setData((d) => ({ ...d, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/enquiries', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...data, source, result }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Submission failed');
      }
      onUnlock(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="rounded-[24px] overflow-hidden"
      style={{ border: '1px solid var(--brand-line)', boxShadow: '0 4px 32px rgba(13,21,53,0.08)' }}
    >
      {teaserScore !== undefined && (
        <div className="relative px-8 py-10 text-center" style={{ background: 'var(--surface-alt)', borderBottom: '1px solid var(--brand-line)' }}>
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

      <div className="px-8 py-8">
        <h3 className="font-bold text-xl mb-2" style={{ color: 'var(--ink)', letterSpacing: '-0.015em' }}>
          Get your full {toolName} results
        </h3>
        <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--ink-soft)' }}>
          Enter your details and we will email your complete breakdown plus tailored next steps. We only use these to send your results and follow up if you want a call.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Field id="eg-name"    type="text"   placeholder="Full name"     value={data.fullName}    onChange={update('fullName')}    autoComplete="name"       />
          <Field id="eg-email"   type="email"  placeholder="Work email"    value={data.email}       onChange={update('email')}       autoComplete="email"      />
          <Field id="eg-phone"   type="tel"    placeholder="Phone"         value={data.phone}       onChange={update('phone')}       autoComplete="tel"        />
          <Field id="eg-company" type="text"   placeholder="Company name"  value={data.companyName} onChange={update('companyName')} autoComplete="organization"/>

          {error && (
            <p className="text-xs" style={{ color: '#DC2626' }}>{error}</p>
          )}

          <button type="submit" className="btn-gradient w-full" disabled={loading}>
            {loading
              ? 'Sending…'
              : <span className="inline-flex items-center gap-2"><CheckCircle2 size={15} /> Send me my results <ArrowRight size={15} /></span>
            }
          </button>
        </form>

        <p className="text-xs mt-4 text-center" style={{ color: 'var(--ink-faint)' }}>
          Data handled under UK GDPR. We will never share your details. Unsubscribe anytime.
        </p>
      </div>
    </div>
  );
}

function Field(props: {
  id: string; type: string; placeholder: string;
  value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  autoComplete?: string;
}) {
  return (
    <>
      <label htmlFor={props.id} className="sr-only">{props.placeholder}</label>
      <input
        id={props.id}
        type={props.type}
        required
        placeholder={props.placeholder}
        value={props.value}
        onChange={props.onChange}
        autoComplete={props.autoComplete}
        className="w-full px-5 py-3.5 rounded-[12px] text-sm outline-none transition-all"
        style={{ background: 'var(--surface-alt)', border: '1.5px solid var(--brand-line)', color: 'var(--ink)' }}
        onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--brand-purple)')}
        onBlur={(e)  => (e.currentTarget.style.borderColor = 'var(--brand-line)')}
      />
    </>
  );
}
