import type { Metadata } from 'next';
import Image from 'next/image';
import LoginForm from '@/components/modules/LoginForm';

export const metadata: Metadata = { title: 'Sign In' };

const LOGO = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/the%20people%20system%20%282%29.png';

const REASON_MESSAGES: Record<string, { tone: 'info' | 'warn'; text: string }> = {
  archived:     { tone: 'warn', text: 'This client portal has been archived. Contact The People System if you believe this is in error.' },
  'no-profile': { tone: 'info', text: 'We could not find your profile. Please sign in again or contact The People System.' },
  'no-session': { tone: 'info', text: 'Your session expired. Please sign in again.' },
  // 'error' is set by /auth/activate when something goes wrong on
  // the password-set redirect. Most common: 'config' (server is
  // missing SUPABASE_SERVICE_ROLE_KEY, e.g. someone hit a stray
  // www. subdomain that wasn't configured). Tell the user to ask
  // for a fresh link rather than 'log in', because they can't.
  config:       { tone: 'warn', text: 'The portal is missing a required configuration value. Ask The People System to send you a fresh activation link.' },
  invalid:      { tone: 'warn', text: 'This activation link has already been used or is no longer valid. Ask The People System for a fresh link.' },
  expired:      { tone: 'warn', text: 'This activation link has expired. Ask The People System for a fresh link.' },
  link:         { tone: 'warn', text: 'We could not generate your sign-in link. Ask The People System to resend your invitation.' },
  'set-password': { tone: 'info', text: 'Your password is set. Please sign in below.' },
};

export default function LoginPage({ searchParams }: { searchParams?: { reason?: string; error?: string } }) {
  // Activate failures land here as ?error=config|invalid|expired|link.
  // Layout-driven redirects use ?reason=archived|no-session|...  We
  // accept either so neither flow shows a blank page.
  const code    = (searchParams?.reason ?? searchParams?.error ?? '').toString();
  const message = REASON_MESSAGES[code];

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: '#FFFFFF' }}
    >

      <div className="relative w-full max-w-[400px]">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Image
            src={LOGO}
            alt="The People System"
            width={140}
            height={48}
            className="h-10 w-auto object-contain brightness-110"
            priority
          />
        </div>

        {/* Card */}
        <div
          className="rounded-[20px] p-8"
          style={{
            background: '#FFFFFF',
            border: '1px solid var(--line)',
          }}
        >
          <h1 className="font-display font-bold text-xl mb-1" style={{ color: '#0A0F1E' }}>Welcome back</h1>
          <p className="text-sm mb-5" style={{ color: 'var(--ink-soft)' }}>
            Sign in to your portal
          </p>
          {message && (
            <div
              className="rounded-[10px] px-4 py-3 mb-5 text-xs leading-relaxed"
              style={{
                background: message.tone === 'warn' ? 'rgba(217,119,6,0.08)' : 'rgba(124,58,237,0.06)',
                border:     message.tone === 'warn' ? '1px solid rgba(217,119,6,0.20)' : '1px solid rgba(124,58,237,0.18)',
                color:      message.tone === 'warn' ? '#92400E' : 'var(--ink-soft)',
              }}
            >
              {message.text}
            </div>
          )}
          <LoginForm />
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'var(--ink-faint)' }}>
          Need access?{' '}
          <a href="mailto:hello@thepeopleoffice.co.uk" className="underline" style={{ color: 'var(--purple)' }}>
            Contact us
          </a>
        </p>
      </div>
    </div>
  );
}
