import type { Metadata } from 'next';
import Image from 'next/image';
import LoginForm from '@/components/modules/LoginForm';

export const metadata: Metadata = { title: 'Sign In' };

const LOGO = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/the%20people%20system%20%282%29.png';

export default function LoginPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--navy)' }}
    >
      {/* Glow */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 0%, rgba(143,114,246,0.2) 0%, transparent 70%)',
        }}
      />

      <div className="relative w-full max-w-[400px]">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Image
            src={LOGO}
            alt="The People Office"
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
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(20px)',
          }}
        >
          <h1 className="font-display font-bold text-xl text-white mb-1">Welcome back</h1>
          <p className="text-sm mb-7" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Sign in to your portal
          </p>
          <LoginForm />
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'rgba(255,255,255,0.25)' }}>
          Need access?{' '}
          <a href="mailto:hello@thepeopleoffice.co.uk" className="underline" style={{ color: 'rgba(147,184,255,0.7)' }}>
            Contact us
          </a>
        </p>
      </div>
    </div>
  );
}
