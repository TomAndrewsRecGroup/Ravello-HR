'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

const LOGO = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/the%20people%20system%20%282%29.png';

const ERROR_MESSAGES: Record<string, string> = {
  expired: 'Your invitation link has expired. Ask whoever invited you to send a new one.',
  invalid: 'This invitation link has already been used or is invalid. Ask whoever invited you to send a new one.',
  link:    'Something went wrong processing your invitation. Please try again or contact support.',
  missing: 'No invitation token found. Please use the link from your invitation email.',
};

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#FFFFFF' }}>
        <Loader2 size={20} className="animate-spin" style={{ color: 'var(--purple)' }} />
      </div>
    }>
      <AcceptInviteInner />
    </Suspense>
  );
}

function AcceptInviteInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const supabase     = createClient();

  const errorCode = searchParams.get('error') ?? '';
  const errorMsg  = ERROR_MESSAGES[errorCode] ?? '';

  // Pre-fill email from query string if it was passed.
  const emailHint = searchParams.get('email') ?? '';

  const [email,    setEmail]    = useState(emailHint);
  const [token,    setToken]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [done,     setDone]     = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const code = token.replace(/\s+/g, '');
    if (!email.trim()) {
      setError('Enter the email the invite was sent to.');
      return;
    }
    if (!/^\d{6,10}$/.test(code)) {
      setError('Enter the numeric code from your invitation email.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords don’t match.');
      return;
    }

    setLoading(true);

    // 1. Verify the invite token — creates a session.
    const { error: verifyErr } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code,
      type:  'invite',
    });
    if (verifyErr) {
      setLoading(false);
      setError(verifyErr.message.includes('expired') || verifyErr.message.includes('invalid')
        ? 'That code is invalid or expired. Ask whoever invited you for a new one.'
        : verifyErr.message);
      return;
    }

    // 2. Set the password against the now-active session.
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateErr) {
      setError(updateErr.message);
      return;
    }

    setDone(true);
    // Hard navigation (not router.push) so cookies set by verifyOtp /
    // updateUser are guaranteed to be on the next request — a soft
    // SPA push can race the cookie write and land on the dashboard
    // before middleware sees the session, causing a blank-screen hang.
    setTimeout(() => { window.location.assign('/dashboard'); }, 1400);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#FFFFFF' }}>
      <div className="w-full max-w-[400px]">
        <div className="flex justify-center mb-8">
          <Image src={LOGO} alt="The People System" width={140} height={48} className="h-10 w-auto object-contain brightness-110" priority />
        </div>

        <div className="rounded-[20px] p-8" style={{ background: '#FFFFFF', border: '1px solid var(--line)' }}>
          {done ? (
            <div className="flex items-start gap-3 p-4 rounded-[10px]" style={{ background: 'rgba(20,184,166,0.10)', color: 'var(--teal)' }}>
              <CheckCircle2 size={18} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Account ready</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--ink-soft)' }}>Signing you in…</p>
              </div>
            </div>
          ) : (
            <>
              {errorMsg && (
                <div className="flex items-start gap-3 p-4 mb-6 rounded-[10px]" style={{ background: 'rgba(217,68,68,0.08)', color: 'var(--red)' }}>
                  <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                  <p className="text-sm">{errorMsg}</p>
                </div>
              )}
              <h1 className="font-display font-bold text-xl mb-1" style={{ color: '#0A0F1E' }}>Accept your invitation</h1>
              <p className="text-sm mb-7" style={{ color: 'var(--ink-soft)' }}>
                Enter the code from your invitation email and set a password.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="form-group">
                  <label className="label" style={{ color: 'var(--ink-soft)' }}>Email</label>
                  <input
                    type="email" required value={email} onChange={e => setEmail(e.target.value)}
                    className="input" placeholder="you@company.co.uk" autoComplete="email"
                    style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink)' }}
                  />
                </div>
                <div className="form-group">
                  <label className="label" style={{ color: 'var(--ink-soft)' }}>Invitation code</label>
                  <input
                    type="text" inputMode="numeric" pattern="\d{6,10}" maxLength={10} required
                    value={token} onChange={e => setToken(e.target.value.replace(/\D/g, ''))}
                    className="input" placeholder="••••••••" autoComplete="one-time-code"
                    style={{
                      background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink)',
                      fontFamily: 'SFMono-Regular,Menlo,Consolas,monospace',
                      fontSize: 18, letterSpacing: '0.18em', textAlign: 'center',
                    }}
                  />
                </div>
                <div className="form-group">
                  <label className="label" style={{ color: 'var(--ink-soft)' }}>Set password</label>
                  <input
                    type="password" required minLength={8} autoComplete="new-password"
                    value={password} onChange={e => setPassword(e.target.value)}
                    className="input" placeholder="At least 8 characters"
                    style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink)' }}
                  />
                </div>
                <div className="form-group">
                  <label className="label" style={{ color: 'var(--ink-soft)' }}>Confirm password</label>
                  <input
                    type="password" required minLength={8} autoComplete="new-password"
                    value={confirm} onChange={e => setConfirm(e.target.value)}
                    className="input" placeholder="Type it again"
                    style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink)' }}
                  />
                </div>
                {error && <p className="text-xs p-3 rounded-[8px]" style={{ background: 'rgba(217,68,68,0.08)', color: 'var(--red)' }}>{error}</p>}
                <button type="submit" disabled={loading} className="btn-cta w-full justify-center">
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  {loading ? 'Setting up…' : 'Accept and sign in'}
                </button>
              </form>
            </>
          )}
        </div>
        <p className="text-center mt-5 text-xs">
          <a href="/auth/login" style={{ color: 'var(--purple)' }}>← Already have an account? Sign in</a>
        </p>
      </div>
    </div>
  );
}
