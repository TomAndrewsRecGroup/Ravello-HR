import type { Metadata } from 'next';
import Image from 'next/image';
import LoginForm from '@/components/modules/LoginForm';

export const metadata: Metadata = { title: 'Sign In' };

const LOGO = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/the%20people%20system%20%282%29.png';

export default function LoginPage() {
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
            background: '#FFFFFF',
            border: '1px solid var(--line)',
          }}
        >
          <h1 className="font-display font-bold text-xl mb-1" style={{ color: '#0A0F1E' }}>Welcome back</h1>
          <p className="text-sm mb-7" style={{ color: 'var(--ink-soft)' }}>
            Sign in to your portal
          </p>
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
