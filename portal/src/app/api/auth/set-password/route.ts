import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertBodySize } from '@/lib/http/bodySize';
import { normaliseAccessToken, redeemAccessToken } from '@/lib/auth/accessTokens';
import { adminUrl } from '@/lib/adminUrl';

export const runtime = 'nodejs';

/**
 * Atomically consume a 7-day invite token and set the user's password.
 *
 * The claim (DELETE … WHERE token_hash = sha256(token) AND not expired
 * RETURNING, in redeemAccessToken) makes this single-use under
 * contention — a fast double-click can't burn the token twice — and
 * burns the account's other outstanding links with it. After the
 * claim, we set the password via auth.admin.updateUserById.
 *
 * Tokens live hashed in profile_access_tokens (migration 091), which
 * only the service role can read. Until 2026-09-24 they sat in plain
 * text in profiles.invite_token, where a client_admin could read a
 * colleague's reset token and choose their password.
 *
 * Returns the user's email so the client can immediately sign in
 * with signInWithPassword and avoid the magic-link redirect dance.
 */
export async function POST(req: NextRequest) {
  const tooBig = assertBodySize(req, 64 * 1024);
  if (tooBig) return tooBig;

  let body: { token?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const token    = normaliseAccessToken(body.token);
  const password = (body.password ?? '').toString();

  if (!token) {
    return NextResponse.json({ error: 'Invalid token format.' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  }
  if (password.length > 200) {
    return NextResponse.json({ error: 'Password too long.' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[/api/auth/set-password] env missing', {
      hasSupabaseUrl: !!url,
      hasServiceKey:  !!key,
    });
    return NextResponse.json({
      error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL on the portal Vercel project. Contact Core OS 360.',
    }, { status: 500 });
  }

  const sb = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Atomic consume: race-safe single-use.
  const redeemed = await redeemAccessToken(sb, token);
  if (redeemed && 'error' in redeemed) {
    console.error('[set-password] token claim failed:', redeemed.error);
    return NextResponse.json({ error: 'Could not validate link.' }, { status: 500 });
  }
  if (!redeemed) {
    return NextResponse.json({
      error: 'This activation link has already been used or has expired. Ask Core OS 360 for a fresh link.',
    }, { status: 410 });
  }
  const { data: claimed, error: profErr } = await sb
    .from('profiles').select('id, email, role').eq('id', redeemed.profileId).maybeSingle();
  if (profErr || !claimed) {
    console.error('[set-password] profile read failed:', profErr?.message ?? 'no profile');
    return NextResponse.json({ error: 'Could not find the account for this link.' }, { status: 500 });
  }

  // Set the password.
  const { error: updateErr } = await sb.auth.admin.updateUserById(claimed.id, {
    password,
    email_confirm: true,
  });

  if (updateErr) {
    // Token is already consumed at this point; surface a clear retry
    // path. Operator can resend the invite to mint a new token.
    console.error('[set-password] updateUserById failed:', updateErr.message);
    return NextResponse.json({
      error: `Could not save password: ${updateErr.message}. Ask Core OS 360 for a fresh link.`,
    }, { status: 500 });
  }

  // An H&S provider works in the admin app, not here (the portal's
  // middleware would only bounce them). Tell the form to send them
  // there to sign in, rather than signing them in to a portal session
  // they cannot use.
  if ((claimed as { role?: string }).role === 'hs_provider') {
    return NextResponse.json({
      success: true,
      email:   claimed.email,
      next:    `${adminUrl()}/auth/login?reason=password-set`,
    });
  }

  return NextResponse.json({ success: true, email: claimed.email });
}
