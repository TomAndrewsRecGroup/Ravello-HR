'use client';
import { useState } from 'react';
import { Loader2, Mail, CheckCircle2, UserPlus, X } from 'lucide-react';

interface Props {
  companyId: string;
}

const ROLE_OPTIONS = [
  { value: 'client_admin',  label: 'Admin — full portal access' },
  { value: 'client_viewer', label: 'Viewer — read-only access' },
];

export default function InviteUserPanel({ companyId }: Props) {
  const [open,      setOpen]      = useState(false);
  const [email,     setEmail]     = useState('');
  const [fullName,  setFullName]  = useState('');
  const [role,      setRole]      = useState('client_admin');
  const [loading,   setLoading]   = useState(false);
  const [success,   setSuccess]   = useState(false);
  const [error,     setError]     = useState('');

  async function send() {
    if (!email) return;
    setLoading(true);
    setError('');

    const res = await fetch('/api/invite', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, company_id: companyId, role, full_name: fullName || undefined }),
    });

    const body = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(body.error ?? 'Invite failed. Please try again.');
      return;
    }

    setSuccess(true);
    setEmail('');
    setFullName('');
    setRole('client_admin');
  }

  function reset() {
    setOpen(false);
    setSuccess(false);
    setError('');
    setEmail('');
    setFullName('');
    setRole('client_admin');
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="btn-cta btn-sm flex items-center gap-1.5"
      >
        <UserPlus size={13} /> Invite User
      </button>
    );
  }

  if (success) {
    return (
      <div
        className="rounded-[10px] px-4 py-3 flex items-center gap-3"
        style={{ background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.2)' }}
      >
        <CheckCircle2 size={15} style={{ color: 'var(--success)', flexShrink: 0 }} />
        <div className="flex-1">
          <p className="text-sm font-medium" style={{ color: 'var(--emerald)' }}>Invite sent</p>
          <p className="text-xs" style={{ color: '#166534', opacity: 0.8 }}>
            The user will receive a magic-link to set up their portal account.
          </p>
        </div>
        <button onClick={() => { setSuccess(false); setOpen(true); }} className="text-xs font-medium" style={{ color: 'var(--emerald)' }}>
          Invite another
        </button>
        <button onClick={reset} className="btn-ghost btn-sm flex items-center gap-1"><X size={12} /></button>
      </div>
    );
  }

  return (
    <div
      className="rounded-[12px] p-4 space-y-3"
      style={{ background: 'var(--surface-alt)', border: '1px solid var(--line)' }}
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>
          Invite New User
        </p>
        <button onClick={reset} className="btn-ghost btn-sm flex items-center gap-1"><X size={12} /></button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Email *</label>
          <input
            type="email"
            className="input"
            placeholder="name@company.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
          />
        </div>
        <div>
          <label className="label">Full Name</label>
          <input
            className="input"
            placeholder="Jane Smith"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Role</label>
          <select className="input" value={role} onChange={e => setRole(e.target.value)}>
            {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {error && (
        <p className="text-xs px-3 py-2 rounded-[8px]"
          style={{ background: 'rgba(220,38,38,0.08)', color: 'var(--rose)', border: '1px solid rgba(220,38,38,0.2)' }}>
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={send}
          disabled={loading || !email}
          className="btn-cta btn-sm flex items-center gap-1.5"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
          Send Invite
        </button>
        <button onClick={reset} className="btn-ghost btn-sm flex items-center gap-1"><X size={12} /> Cancel</button>
      </div>
    </div>
  );
}
