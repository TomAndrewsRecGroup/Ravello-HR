'use client';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const MESSAGES: Record<string, string> = {
  'no-session': 'Your session has expired. Please sign in again.',
  'unauthorised': 'You do not have access to this area. Contact your administrator.',
};

export default function AdminLoginForm() {
  const searchParams = useSearchParams();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    const reason = searchParams.get('reason');
    if (reason && MESSAGES[reason]) {
      setError(MESSAGES[reason]);
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError('Invalid email or password.');
        setLoading(false);
        return;
      }

      if (!data.session) {
        setError('Your email address has not been confirmed. Please check your inbox.');
        setLoading(false);
        return;
      }

      window.location.href = '/dashboard';
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="form-group">
        <label htmlFor="admin-email" className="label" style={{ color: 'var(--ink-soft)' }}>Email</label>
        <input
          id="admin-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="input"
          placeholder="you@thepeopleoffice.co.uk"
          style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink)' }}
        />
      </div>
      <div className="form-group">
        <label htmlFor="admin-password" className="label" style={{ color: 'var(--ink-soft)' }}>Password</label>
        <div className="relative">
          <input
            id="admin-password"
            type={showPwd ? 'text' : 'password'}
            required
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="input pr-10"
            style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink)' }}
          />
          <button
            type="button"
            aria-label={showPwd ? 'Hide password' : 'Show password'}
            className="absolute right-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--ink-faint)' }}
            onClick={() => setShowPwd(!showPwd)}
          >
            {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-xs p-3 rounded-[8px]" style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--danger)' }}>
          {error}
        </p>
      )}
      <button type="submit" disabled={loading} className="btn-cta w-full justify-center mt-2">
        {loading && <Loader2 size={14} className="animate-spin" />}
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
