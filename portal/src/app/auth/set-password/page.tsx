// Direct set-password flow.
//
// Replaces the magic-link bounce on /auth/activate. The recipient
// clicks the email link, lands on this page, types a password, and
// is signed in — no Supabase verify URL hop, no redirect_to
// allowlist dependency.
//
// Token-validation contract:
//   1. Server component validates the 7-day UUID token in profiles
//      .invite_token before rendering. If invalid/expired we show
//      a clear message and a 'request a new link' CTA — we DO NOT
//      consume the token here, so a refresh on the password page
//      doesn't burn the user's chance.
//   2. Token is consumed atomically by the form-submit POST to
//      /api/auth/set-password (CAS UPDATE).
//   3. After password set, client signs in with email+password and
//      lands on /dashboard.

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import SetPasswordForm from './SetPasswordForm';

// Never statically optimise: token validation runs server-side per
// request and we don't want any cached redirect-to-login response.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface Props {
  searchParams: { token?: string };
}

export default async function SetPasswordPage({ searchParams }: Props) {
  const token = searchParams.token?.trim();
  if (!token) redirect('/auth/login?error=invalid');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    // Log which one is missing so the operator can spot the gap in
    // Vercel function logs without exposing var status to the visitor.
    console.error('[set-password] env missing', {
      hasSupabaseUrl: !!url,
      hasServiceKey:  !!key,
      // Show the env keys we tried — helps diagnose typos
      // (e.g. SUPABASE_SERVICE_KEY vs SUPABASE_SERVICE_ROLE_KEY).
      tried_url_keys: ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'],
      tried_key_keys: ['SUPABASE_SERVICE_ROLE_KEY'],
    });
    return <SetPasswordError reason="config" />;
  }

  const sb = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profile } = await sb
    .from('profiles')
    .select('id, email, full_name, invite_token_expires_at, companies:company_id(name)')
    .eq('invite_token', token)
    .maybeSingle();

  if (!profile) {
    return <SetPasswordError reason="invalid" />;
  }
  if (!profile.invite_token_expires_at || new Date(profile.invite_token_expires_at) < new Date()) {
    return <SetPasswordError reason="expired" />;
  }

  const companyName = (profile as any).companies?.name ?? null;

  return (
    <SetPasswordForm
      token={token}
      email={profile.email ?? ''}
      fullName={profile.full_name ?? null}
      companyName={companyName}
    />
  );
}

function SetPasswordError({ reason }: { reason: 'config' | 'invalid' | 'expired' }) {
  const messages: Record<string, string> = {
    config:  'The portal is missing a required configuration value. Contact The People System and ask them to send you a fresh activation link.',
    invalid: 'This activation link has already been used or is no longer valid. Ask The People System for a fresh link.',
    expired: 'This activation link has expired. Ask The People System for a fresh link.',
  };

  const LOGO = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/the%20people%20system%20%282%29.png';

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#FFFFFF' }}>
      <div className="relative w-full max-w-[400px]">
        <div className="flex justify-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="The People System" style={{ height: 40, objectFit: 'contain' }} />
        </div>
        <div className="rounded-[20px] p-8" style={{ background: '#FFFFFF', border: '1px solid var(--line)' }}>
          <h1 className="font-display font-bold text-xl mb-3" style={{ color: '#0A0F1E' }}>Link unavailable</h1>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
            {messages[reason]}
          </p>
          <p className="text-xs mt-6" style={{ color: 'var(--ink-faint)' }}>
            Need help? <a href="mailto:hello@thepeoplesystem.co.uk" style={{ color: 'var(--purple)' }}>Contact us</a>
          </p>
        </div>
      </div>
    </div>
  );
}
