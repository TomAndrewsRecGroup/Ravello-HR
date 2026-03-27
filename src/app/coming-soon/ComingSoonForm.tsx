'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';

const LOGO = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/d853d50b-40d4-47f4-ac80-7058a2387dac.png';

export default function ComingSoonForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next   = params.get('next') ?? '/';

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        router.push(next);
        router.refresh();
      } else {
        setError('Incorrect credentials.');
      }
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: '420px' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '36px' }}>
        <Image src={LOGO} alt="The People Office" width={150} height={50}
          style={{ height: '44px', width: 'auto', filter: 'brightness(1.1)' }} priority />
      </div>

      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <h1 style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontWeight: 300, fontSize: '2.6rem', lineHeight: 1.08,
          letterSpacing: '-0.025em', color: '#ffffff', margin: '0 0 10px',
        }}>
          The People System
        </h1>
        <div style={{
          background: 'linear-gradient(135deg, #EA3DC4 0%, #7C3AED 45%, #3B6FFF 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          fontWeight: 700, fontSize: '0.75rem',
          letterSpacing: '0.22em', textTransform: 'uppercase' as const,
          fontFamily: "'DM Sans', sans-serif",
        }}>
          Coming Soon
        </div>
      </div>

      <div style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: '20px', padding: '36px',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      }}>
        <p style={{
          color: 'rgba(255,255,255,0.45)', fontSize: '0.875rem',
          marginBottom: '24px', textAlign: 'center',
        }}>
          Enter your credentials to access the system
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{
              display: 'block', fontSize: '0.7rem', fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase' as const,
              color: 'rgba(255,255,255,0.4)', marginBottom: '8px',
            }}>Email</label>
            <input
              type="email" required autoComplete="email"
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              style={{
                width: '100%', padding: '11px 14px', borderRadius: '10px',
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#fff', fontSize: '0.875rem', outline: 'none',
                boxSizing: 'border-box' as const,
              }}
            />
          </div>

          <div>
            <label style={{
              display: 'block', fontSize: '0.7rem', fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase' as const,
              color: 'rgba(255,255,255,0.4)', marginBottom: '8px',
            }}>Password</label>
            <input
              type="password" required autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: '100%', padding: '11px 14px', borderRadius: '10px',
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#fff', fontSize: '0.875rem', outline: 'none',
                boxSizing: 'border-box' as const,
              }}
            />
          </div>

          {error && (
            <p style={{
              color: '#FCA5A5', fontSize: '0.8rem', textAlign: 'center',
              background: 'rgba(217,68,68,0.12)', borderRadius: '8px',
              padding: '10px', margin: 0,
            }}>{error}</p>
          )}

          <button
            type="submit" disabled={loading}
            style={{
              marginTop: '8px', padding: '13px 24px', borderRadius: '10px',
              background: 'linear-gradient(135deg, #EA3DC4 0%, #7C3AED 45%, #3B6FFF 100%)',
              border: 'none', color: '#fff', fontSize: '0.875rem', fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
              letterSpacing: '0.02em', width: '100%',
              boxShadow: '0 2px 18px rgba(124,58,237,0.38)',
              transition: 'opacity 0.15s',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {loading ? 'Verifying…' : 'Access System'}
          </button>
        </form>
      </div>

      <p style={{
        textAlign: 'center', marginTop: '24px', fontSize: '0.75rem',
        color: 'rgba(255,255,255,0.2)',
      }}>
        The People Office · Confidential Preview
      </p>
    </div>
  );
}
