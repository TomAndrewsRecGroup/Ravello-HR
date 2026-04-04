'use client';
export const dynamic = 'force-dynamic';
import { useState } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';

const LOGO = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/the%20people%20system%20%282%29.png';

export default function ResetPasswordPage() {
  const supabase = createClient();
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/settings`,
    });
    if (error) { setError(error.message); setLoading(false); return; }
    setSent(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#070B1D' }}>
      <div className="w-full max-w-[380px]">
        <div className="flex justify-center mb-8">
          <Image src={LOGO} alt="The People Office" width={120} height={40} className="h-9 w-auto brightness-110" />
        </div>
        <div className="rounded-[20px] p-8" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <h1 className="font-display font-bold text-xl text-white mb-1">Reset password</h1>
          <p className="text-sm mb-7" style={{ color: 'rgba(255,255,255,0.4)' }}>We'll email you a reset link</p>
          {sent ? (
            <p className="text-sm p-4 rounded-[10px]" style={{ background: 'rgba(52,211,153,0.1)', color: '#6EE7B7' }}>
              Check your inbox — a reset link is on its way.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="form-group">
                <label className="label" style={{ color: 'rgba(255,255,255,0.5)' }}>Email</label>
                <input
                  type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  className="input" placeholder="you@company.co.uk"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                />
              </div>
              {error && <p className="text-xs p-3 rounded-[8px]" style={{ background: 'rgba(239,68,68,0.12)', color: '#FCA5A5' }}>{error}</p>}
              <button type="submit" disabled={loading} className="btn-cta w-full justify-center">
                {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          )}
        </div>
        <p className="text-center mt-5 text-xs">
          <a href="/auth/login" style={{ color: 'rgba(147,184,255,0.7)' }}>← Back to sign in</a>
        </p>
      </div>
    </div>
  );
}
