'use client';
import { useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function LoginForm() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      // Hard navigation so middleware picks up the new session cookies
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="form-group">
        <label className="label" style={{ color: '#4B5563' }}>Email address</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="you@company.co.uk"
          className="input"
          style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#111827' }}
        />
      </div>

      <div className="form-group">
        <label className="label" style={{ color: '#4B5563' }}>Password</label>
        <div className="relative">
          <input
            type={showPwd ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
            className="input pr-10"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#111827' }}
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2"
            style={{ color: '#9CA3AF' }}
            onClick={() => setShowPwd(!showPwd)}
          >
            {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-xs p-3 rounded-[8px]" style={{ background: 'rgba(239,68,68,0.12)', color: '#DC2626' }}>
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
    </form>
  );
}
