'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { Loader2, CheckCircle2 } from 'lucide-react';

const LOGO = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/the%20people%20system%20%282%29.png';

// Password setup / update.
//
// Reached by two flows:
//   • Invite acceptance — invite email magic-link → /auth/callback
//     → redirects here with ?welcome=1 so a brand-new client gets a
//     guided "set your password" experience instead of landing on
//     /dashboard with no password (magic-link sessions only).
//   • Password reset — request reset email → callback → here.
//
// The page assumes the user is already signed in (the callback already
// exchanged the auth code). It just calls supabase.auth.updateUser to
// set the password on the existing session.

export default function UpdatePasswordPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const supabase     = createClient();
  const isWelcome    = searchParams.get('welcome') === '1';

  const [authChecked, setAuthChecked] = useState(false);
  const [hasSession,  setHasSession]  = useState(false);
  const [password,    setPassword]    = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [done,        setDone]        = useState(false);

  // Confirm we have a session — if the user landed here without one
  // (e.g. they bookmarked the URL or the magic-link expired), bounce
  // them to login with a friendly reason.
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setHasSession(!!user);
      setAuthChecked(true);
    });
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords don’t match.');
      return;
    }

    setLoading(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateErr) {
      setError(updateErr.message);
      return;
    }

    setDone(true);
    // Brief confirmation, then push to dashboard.
    setTimeout(() => router.push('/dashboard'), 1400);
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#FFFFFF' }}>
        <Loader2 size={20} className="animate-spin" style={{ color: 'var(--purple)' }} />
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#FFFFFF' }}>
        <div className="w-full max-w-[380px] text-center">
          <div className="flex justify-center mb-8">
            <Image src={LOGO} alt="The People System" width={120} height={40} className="h-9 w-auto" priority />
          </div>
          <div className="rounded-[20px] p-8" style={{ background: '#FFFFFF', border: '1px solid var(--line)' }}>
            <h1 className="font-display font-bold text-xl mb-2" style={{ color: '#0A0F1E' }}>Link expired</h1>
            <p className="text-sm mb-5" style={{ color: 'var(--ink-soft)' }}>
              That sign-in link has expired or already been used. Request a fresh one to set your password.
            </p>
            <a href="/auth/reset-password" className="btn-cta w-full justify-center">Request new link</a>
          </div>
          <p className="text-center mt-5 text-xs">
            <a href="/auth/login" style={{ color: 'var(--purple)' }}>← Back to sign in</a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#FFFFFF' }}>
      <div className="w-full max-w-[400px]">
        <div className="flex justify-center mb-8">
          <Image src={LOGO} alt="The People System" width={140} height={48} className="h-10 w-auto object-contain brightness-110" priority />
        </div>

        <div className="rounded-[20px] p-8" style={{ background: '#FFFFFF', border: '1px solid var(--line)' }}>
          <h1 className="font-display font-bold text-xl mb-1" style={{ color: '#0A0F1E' }}>
            {isWelcome ? 'Welcome — set your password' : 'Update your password'}
          </h1>
          <p className="text-sm mb-7" style={{ color: 'var(--ink-soft)' }}>
            {isWelcome
              ? 'Choose a password to finish setting up your account.'
              : 'Choose a new password to sign in with.'}
          </p>

          {done ? (
            <div className="flex items-start gap-3 p-4 rounded-[10px]" style={{ background: 'rgba(20,184,166,0.10)', color: 'var(--teal)' }}>
              <CheckCircle2 size={18} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Password set</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--ink-soft)' }}>Redirecting you to your dashboard…</p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="form-group">
                <label className="label" style={{ color: 'var(--ink-soft)' }}>New password</label>
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
              {error && (
                <p className="text-xs p-3 rounded-[8px]" style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--danger)' }}>
                  {error}
                </p>
              )}
              <button type="submit" disabled={loading} className="btn-cta w-full justify-center">
                {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                {loading ? 'Saving…' : isWelcome ? 'Set password and continue' : 'Update password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
