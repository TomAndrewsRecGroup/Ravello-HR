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

  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Strip leading 'www.' so admin emails minted with a misformatted
  // NEXT_PUBLIC_PORTAL_URL still redirect through the canonical host
  // — otherwise we end up bouncing to www.portal.…/auth/login?error=
  // config when the wrong subdomain has missing env vars.
  const rawPortal   = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://portal.thepeoplesystem.co.uk';
  const portalUrl   = (() => {
    try {
      const u = new URL(rawPortal.trim().replace(/\/+$/, ''));
      if (u.hostname.startsWith('www.')) u.hostname = u.hostname.slice(4);
      return u.toString().replace(/\/+$/, '');
    } catch { return 'https://portal.thepeoplesystem.co.uk'; }
  })();

  if (!serviceKey || !supabaseUrl) {
    console.error('[activate] env missing', {
      hasServiceKey: !!serviceKey,
      hasSupabaseUrl: !!supabaseUrl,
      host:           supabaseUrl ? new URL(supabaseUrl).hostname : null,
    });
    redirect('/auth/login?error=config');
  }

  const adminClient = createClient(
    supabaseUrl,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // ── Atomic consume (CAS) ───────────────────────────────────────
  // Single UPDATE … WHERE invite_token = $token AND expires > now()
  // RETURNING. If two tabs / a double-click hit this page in parallel,
  // exactly one wins the row update; the other gets an empty result
  // and is redirected to accept-invite?error=invalid. This is what
  // guarantees the token is single-use under contention — the
  // previous SELECT-then-UPDATE flow let two parallel requests both
  // mint a fresh magic link and both consume.
  const nowIso = new Date().toISOString();
  const { data: claimed, error: claimErr } = await adminClient
    .from('profiles')
    .update({ invite_token: null, invite_token_expires_at: null })
    .eq('invite_token', token)
    .gt('invite_token_expires_at', nowIso)
    .select('id, email')
    .maybeSingle();

  if (claimErr) {
    console.error('[activate] CAS update failed', claimErr.message);
    redirect('/auth/accept-invite?error=link');
  }
  if (!claimed) {
    // Either the token was never valid, has already been consumed,
    // or has expired. We can disambiguate by reading the row by
    // token (NULL after consume so this returns nothing for the
    // race-loser AND for already-used tokens) — for the operator,
    // both cases collapse to 'invalid'. Expired vs invalid is
    // surfaced via a second targeted lookup before we redirect.
    const { data: maybeExpired } = await adminClient
      .from('profiles')
      .select('invite_token_expires_at')
      .eq('invite_token', token)
      .maybeSingle();
    if (maybeExpired) {
      redirect('/auth/accept-invite?error=expired');
    }
    redirect('/auth/accept-invite?error=invalid');
  }

  // ── Generate a fresh Supabase magic link ───────────────────────
  // Token is already consumed at this point; if generateLink errors
  // the recipient will see 'invalid' and need a new link from admin.
  // We accept that small operator-burden trade-off in exchange for
  // not having a re-issuable token across a network blip.
  const redirectTo = purpose === 'reset'
    ? `${portalUrl}/auth/update-password`
    : `${portalUrl}/auth/update-password?welcome=1`;

  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type:  purpose === 'reset' ? 'recovery' : 'magiclink',
    email: claimed.email,
    options: { redirectTo },
  });

  if (linkError || !linkData?.properties?.action_link) {
    console.error('[activate] generateLink failed AFTER token consume', linkError?.message);
    redirect('/auth/accept-invite?error=link');
  }

  // ── Redirect through the fresh Supabase magic link ─────────────
  // The action_link is a Supabase verify URL that will exchange for
  // an access_token and redirect to /auth/update-password. The token
  // was generated moments ago so it is always fresh.
  redirect(linkData.properties.action_link);
}
