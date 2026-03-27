'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Eye, EyeOff } from 'lucide-react';

export default function AdminLoginForm() {
  const router = useRouter();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/dev-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (res.ok) {
      router.push('/dashboard');
      router.refresh();
    } else {
      setError('Invalid email or password.');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="form-group">
        <label className="label" style={{ color: 'rgba(255,255,255,0.5)' }}>Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="input"
          placeholder="you@thepeopleoffice.co.uk"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
        />
      </div>
      <div className="form-group">
        <label className="label" style={{ color: 'rgba(255,255,255,0.5)' }}>Password</label>
        <div className="relative">
          <input
            type={showPwd ? 'text' : 'password'}
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="input pr-10"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2"
            style={{ color: 'rgba(255,255,255,0.35)' }}
            onClick={() => setShowPwd(!showPwd)}
          >
            {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>
      {error && (
        <p className="text-xs p-3 rounded-[8px]" style={{ background: 'rgba(239,68,68,0.12)', color: '#FCA5A5' }}>
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
