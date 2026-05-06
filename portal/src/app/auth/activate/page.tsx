// Invite activation — server-side token validation + fresh magic-link
// redirect.
//
// Why this page exists:
//   Supabase's native inviteUserByEmail embeds a 1-hour access_token
//   directly in the email link (implicit flow). Clients who open the
//   email more than an hour later see "Link expired". This page is the
//   fix: we store a 7-day UUID token in profiles.invite_token, and
//   the admin invite email links here instead.
//
// Flow:
//   1. Admin invites → /api/invite stores UUID token (7-day expiry)
//      → Resend email → /auth/activate?token=UUID
//   2. Client clicks → THIS PAGE validates the token server-side
//   3. On success → generateLink({ type: 'magiclink' }) creates a
//      FRESH Supabase magic link right now (1-hour window starts NOW,
//      not when the invite was sent)
//   4. 302 → Supabase verify URL → 302 → /auth/update-password with
//      a valid #access_token in the hash
//   5. Client sets their password → dashboard

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

interface Props {
  searchParams: { token?: string; purpose?: string };
}

export default async function ActivatePage({ searchParams }: Props) {
  const token   = searchParams.token?.trim();
  // 'invite' (default) → welcome=1 banner on the password page.
  // 'reset'           → no welcome banner, just sets a new password.
  const purpose = searchParams.purpose?.trim() === 'reset' ? 'reset' : 'invite';

  if (!token) {
    redirect('/auth/accept-invite?error=missing');
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const portalUrl  = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://portal.thepeoplesystem.co.uk';

  if (!serviceKey) {
    redirect('/auth/login?error=config');
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // ── Validate the invite token ──────────────────────────────────
  const { data: profile } = await adminClient
    .from('profiles')
    .select('id, email, invite_token_expires_at')
    .eq('invite_token', token)
    .maybeSingle();

  if (!profile) {
    // Token not found (never existed, already used, or tampered).
    redirect('/auth/accept-invite?error=invalid');
  }

  if (!profile.invite_token_expires_at || new Date(profile.invite_token_expires_at) < new Date()) {
    redirect('/auth/accept-invite?error=expired');
  }

  // ── Generate a fresh Supabase magic link ───────────────────────
  // Do this BEFORE clearing the token so that if generateLink fails
  // the user can retry (the token is still valid).
  // Magic-link for invites and password resets alike — both flows
  // land on /auth/update-password where the user sets a password.
  // Only the 'invite' flow shows the welcome banner.
  const redirectTo = purpose === 'reset'
    ? `${portalUrl}/auth/update-password`
    : `${portalUrl}/auth/update-password?welcome=1`;

  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type:  purpose === 'reset' ? 'recovery' : 'magiclink',
    email: profile.email,
    options: { redirectTo },
  });

  if (linkError || !linkData?.properties?.action_link) {
    console.error('[activate] generateLink failed', linkError?.message);
    redirect('/auth/accept-invite?error=link');
  }

  // ── Consume the token (one-time use) ──────────────────────────
  await adminClient
    .from('profiles')
    .update({ invite_token: null, invite_token_expires_at: null })
    .eq('id', profile.id);

  // ── Redirect through the fresh Supabase magic link ─────────────
  // The action_link is a Supabase verify URL that will exchange for
  // an access_token and redirect to /auth/update-password. The token
  // was generated moments ago so it is always fresh.
  redirect(linkData.properties.action_link);
}
