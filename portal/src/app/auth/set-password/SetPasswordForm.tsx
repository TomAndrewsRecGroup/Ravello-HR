'use client';
import { useState } from 'react';
import Image from 'next/image';
import { Loader2, CheckCircle2, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const LOGO = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/the%20people%20system%20%282%29.png';

interface Props {
  token:       string;
  email:       string;
  fullName:    string | null;
  companyName: string | null;
}

export default function SetPasswordForm({ token, email, fullName, companyName }: Props) {
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [show,     setShow]     = useState(false);
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const first = (fullName ?? '').split(/\s+/)[0] || 'there';

  function validate(): string | null {
    if (password.length < 8)      return 'Password must be at least 8 characters.';
    if (password.length > 200)    return 'Password too long.';
    if (password !== confirm)     return 'Passwords do not match.';
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const v = validate();
    if (v) { setError(v); return; }

    setBusy(true);
    try {
      // 1. Atomically consume the token + set the password server-side.
      const res = await fetch('/api/auth/set-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? 'Could not set password.');
      }

      // 2. Sign in with the freshly-set password. Anon client + the
      // standard auth.signInWithPassword flow — no magic links, no
      // redirect dance. Cookies stamped, middleware re-runs on the
      // next request, dashboard renders.
      const sb = createClient();
      const { error: signInErr } = await sb.auth.signInWithPassword({ email, password });
      if (signInErr) {
        // Password was saved but sign-in failed; send them to login
        // with a clear message rather than burning the success state.
        throw new Error(`Password saved. Please sign in: ${signInErr.message}`);
      }

      window.location.href = '/dashboard';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set password.');
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#FFFFFF' }}>
      <div className="relative w-full max-w-[440px]">
        <div className="flex justify-center mb-8">
          <Image src={LOGO} alt="The People System" width={140} height={48}
                 className="h-10 w-auto object-contain" priority />
        </div>

        <div className="rounded-[20px] p-8" style={{ background: '#FFFFFF', border: '1px solid var(--line)' }}>
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 size={16} style={{ color: 'var(--purple)' }} />
            <p className="eyebrow" style={{ margin: 0 }}>Welcome to The People System</p>
          </div>
          <h1 className="font-display font-bold text-xl mb-2" style={{ color: '#0A0F1E' }}>
            Set your password, {first}
          </h1>
          <p className="text-sm mb-6" style={{ color: 'var(--ink-soft)' }}>
            Choose a password to access your portal{companyName ? <> at <strong>{companyName}</strong></> : null}. You'll
            sign in with this and your email <strong>{email}</strong> from now on.
          </p>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="label">New password</label>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  className="input pr-10"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  disabled={busy}
                  placeholder="At least 8 characters"
                />
                <button type="button" onClick={() => setShow(s => !s)}
                        className="absolute right-2 top-1/2 -translate-y-1/2"
                        style={{ color: 'var(--ink-faint)', background: 'transparent', border: 'none', padding: 4 }}
                        aria-label={show ? 'Hide password' : 'Show password'}>
                  {show ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div>
              <label className="label">Confirm password</label>
              <input
                type={show ? 'text' : 'password'}
                className="input"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
                disabled={busy}
              />
            </div>

            {error && (
              <div className="rounded-[10px] px-3 py-2 flex items-start gap-2 text-xs"
                   style={{ background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.20)', color: '#92400E' }}>
                <AlertTriangle size={13} style={{ marginTop: 1, flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" disabled={busy} className="btn-cta w-full justify-center">
              {busy ? <><Loader2 size={14} className="animate-spin" /> Setting password…</>
                    : 'Set password and sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'var(--ink-faint)' }}>
          Already have a password? <a href="/auth/login" style={{ color: 'var(--purple)' }}>Sign in instead</a>
        </p>
      </div>
    </div>
  );
}
