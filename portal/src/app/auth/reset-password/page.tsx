'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { Loader2, CheckCircle2, ArrowLeft } from 'lucide-react';

const LOGO = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/the%20people%20system%20%282%29.png';

// Reset password — OTP code flow.
//
// Why OTP and not magic-link: corporate email scanners (Outlook Safe
// Links, Gmail's anti-phishing scanner, Mimecast etc.) pre-fetch every
// link in incoming email. Supabase's verify endpoint consumes the
// token on first GET, so the link is "already expired" by the time
// the user clicks. 6-digit codes can't be prefetched.
//
// Flow:
//   Step 1 — User enters email, we call resetPasswordForEmail. Supabase
//            sends an email containing both a code AND a magic link.
//   Step 2 — User enters the code + new password. We verifyOtp({ type:
//            'recovery' }) to mint a session, then updateUser({ password })
//            to set the new password, then redirect to dashboard.
// Magic link still works for users whose email isn't being scanned —
// they land on /auth/update-password directly with hash tokens.

export default function ResetPasswordPage() {
  const router   = useRouter();
  const supabase = createClient();

  const [step,     setStep]     = useState<'email' | 'verify'>('email');
  const [email,    setEmail]    = useState('');
  const [token,    setToken]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [done,     setDone]     = useState(false);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: sendErr } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      // Backup magic-link target (works in email clients without
      // scanners). Lands on /auth/update-password where the page
      // bootstraps the session from the URL hash.
      redirectTo: `${window.location.origin}/auth/update-password`,
    });

    setLoading(false);
    if (sendErr) {
      setError(sendErr.message);
      return;
    }
    setStep('verify');
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const code = token.replace(/\s+/g, '');
    if (!/^\d{6,10}$/.test(code)) {
      setError('Enter the numeric code from your email.');
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

    // 1. Verify the OTP — creates a session.
    const { error: verifyErr } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code,
      type:  'recovery',
    });
    if (verifyErr) {
      setLoading(false);
      setError(verifyErr.message.includes('expired') || verifyErr.message.includes('invalid')
        ? 'That code is invalid or expired. Request a new one.'
        : verifyErr.message);
      return;
    }

    // 2. Update password against the now-active session.
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateErr) {
      setError(updateErr.message);
      return;
    }

    setDone(true);
    setTimeout(() => router.push('/dashboard'), 1400);
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
                <p className="text-sm font-semibold">Password updated</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--ink-soft)' }}>Redirecting you to your dashboard…</p>
              </div>
            </div>
          ) : step === 'email' ? (
            <>
              <h1 className="font-display font-bold text-xl mb-1" style={{ color: '#0A0F1E' }}>Reset password</h1>
              <p className="text-sm mb-7" style={{ color: 'var(--ink-soft)' }}>We&rsquo;ll email you a sign-in code.</p>
              <form onSubmit={handleSendCode} className="space-y-4">
                <div className="form-group">
                  <label className="label" style={{ color: 'var(--ink-soft)' }}>Email</label>
                  <input
                    type="email" required value={email} onChange={e => setEmail(e.target.value)}
                    className="input" placeholder="you@company.co.uk" autoComplete="email"
                    style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink)' }}
                  />
                </div>
                {error && <p className="text-xs p-3 rounded-[8px]" style={{ background: 'rgba(217,68,68,0.08)', color: 'var(--red)' }}>{error}</p>}
                <button type="submit" disabled={loading} className="btn-cta w-full justify-center">
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  {loading ? 'Sending…' : 'Send code'}
                </button>
              </form>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => { setStep('email'); setToken(''); setPassword(''); setConfirm(''); setError(''); }}
                className="flex items-center gap-1 text-xs font-semibold mb-3"
                style={{ color: 'var(--ink-faint)' }}
              >
                <ArrowLeft size={11} /> Use a different email
              </button>
              <h1 className="font-display font-bold text-xl mb-1" style={{ color: '#0A0F1E' }}>Enter your code</h1>
              <p className="text-sm mb-1" style={{ color: 'var(--ink-soft)' }}>
                Check your inbox for the code we just sent.
              </p>
              <p className="text-xs mb-6" style={{ color: 'var(--ink-faint)' }}>
                Sent to <span style={{ color: 'var(--ink-soft)', fontWeight: 500 }}>{email}</span>. Code expires in 1 hour.
              </p>
              <form onSubmit={handleVerify} className="space-y-4">
                <div className="form-group">
                  <label className="label" style={{ color: 'var(--ink-soft)' }}>Code from email</label>
                  <input
                    type="text" inputMode="numeric" pattern="\d{6,10}" maxLength={10} required
                    value={token} onChange={e => setToken(e.target.value.replace(/\D/g, ''))}
                    className="input" placeholder="••••••••"
                    autoComplete="one-time-code"
                    style={{
                      background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink)',
                      fontFamily: 'SFMono-Regular,Menlo,Consolas,monospace',
                      fontSize: 18, letterSpacing: '0.18em', textAlign: 'center',
                    }}
                  />
                </div>
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
                {error && <p className="text-xs p-3 rounded-[8px]" style={{ background: 'rgba(217,68,68,0.08)', color: 'var(--red)' }}>{error}</p>}
                <button type="submit" disabled={loading} className="btn-cta w-full justify-center">
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  {loading ? 'Updating…' : 'Reset password'}
                </button>
              </form>
            </>
          )}
        </div>
        <p className="text-center mt-5 text-xs">
          <a href="/auth/login" style={{ color: 'var(--purple)' }}>← Back to sign in</a>
        </p>
      </div>
    </div>
  );
}
