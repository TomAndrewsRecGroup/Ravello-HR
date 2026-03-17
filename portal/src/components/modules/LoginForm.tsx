'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

export default function LoginForm() {
  const router   = useRouter();
  const supabase = createClient();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="form-group">
        <label className="label" style={{ color: 'rgba(255,255,255,0.5)' }}>Email address</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="you@company.co.uk"
          className="input"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
        />
      </div>

      <div className="form-group">
        <label className="label" style={{ color: 'rgba(255,255,255,0.5)' }}>Password</label>
        <div className="relative">
          <input
            type={showPwd ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
            className="input pr-10"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2"
            style={{ color: 'rgba(255,255,255,0.35)' }}
            onClick={() => setShowPwd(!showPwd)}
          >
            {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-xs p-3 rounded-[8px]" style={{ background: 'rgba(239,68,68,0.12)', color: '#FCA5A5' }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="btn-cta w-full justify-center mt-2"
      >
        {loading && <Loader2 size={15} className="animate-spin" />}
        {loading ? 'Signing in…' : 'Sign in'}
      </button>

      <div className="text-center pt-1">
        <a
          href="/auth/reset-password"
          className="text-xs"
          style={{ color: 'rgba(147,184,255,0.7)' }}
        >
          Forgot your password?
        </a>
      </div>
    </form>
  );
}
