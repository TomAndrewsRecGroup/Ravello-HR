import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertBodySize } from '@/lib/http/bodySize';

export const runtime = 'nodejs';

/**
 * Atomically consume a 7-day invite token and set the user's password.
 *
 * The CAS (UPDATE … WHERE invite_token = ? AND expires > now()
 * RETURNING) makes this single-use under contention — a fast double-
 * click can't burn the token twice. After the consume, we set the
 * password via auth.admin.updateUserById, which is the only Supabase
 * call here that needs the service role.
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

  const token    = (body.token ?? '').trim();
  const password = (body.password ?? '').toString();

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
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
      error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL on the portal Vercel project. Contact The People System.',
    }, { status: 500 });
  }

  const sb = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Atomic consume: race-safe single-use.
  const nowIso = new Date().toISOString();
  const { data: claimed, error: claimErr } = await sb
    .from('profiles')
    .update({ invite_token: null, invite_token_expires_at: null })
    .eq('invite_token', token)
    .gt('invite_token_expires_at', nowIso)
    .select('id, email')
    .maybeSingle();

  if (claimErr) {
    console.error('[set-password] CAS update failed:', claimErr.message);
    return NextResponse.json({ error: 'Could not validate link.' }, { status: 500 });
  }
  if (!claimed) {
    return NextResponse.json({
      error: 'This activation link has already been used or has expired. Ask The People System for a fresh link.',
    }, { status: 410 });
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
      error: `Could not save password: ${updateErr.message}. Ask The People System for a fresh link.`,
    }, { status: 500 });
  }

  return NextResponse.json({ success: true, email: claimed.email });
}
