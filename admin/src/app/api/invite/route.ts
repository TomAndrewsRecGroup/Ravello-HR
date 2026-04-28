import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { auditLog } from '@/lib/audit';
import { PORTAL_INVITE_ROLES, ROLE_LABELS } from '@/lib/ui/statusMaps';
import { sendEmail, userInvitedEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  const supabase = createServerSupabaseClient();

  const { email, company_id, role = 'client_admin', full_name } = await request.json();

  if (!email || !company_id) {
    return NextResponse.json({ error: 'email and company_id are required' }, { status: 400 });
  }

  // ── Validate company_id exists ──
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(company_id)) {
    return NextResponse.json({ error: 'Invalid company_id format' }, { status: 400 });
  }
  const { data: company, error: companyErr } = await supabase
    .from('companies').select('id').eq('id', company_id).single();
  if (companyErr || !company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  // Whitelist of accepted portal roles (Admin or Editor). Anything else
  // falls back to Admin so an invite never lands a sub-user with a
  // role we don't expect.
  const safeRole = (PORTAL_INVITE_ROLES as readonly string[]).includes(role) ? role : 'client_admin';

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Invite via Supabase Auth Admin API: sends a magic-link invite email.
  // Supabase returns invite confirmations using IMPLICIT FLOW — auth
  // tokens come back in the URL hash (#access_token=...). Server-side
  // route handlers can't see hashes (browsers don't send them), so we
  // skip /auth/callback and point directly at /auth/update-password.
  // That page is a client component and detects the hash via supabase-js
  // (detectSessionInUrl=true), creates the session, then shows the
  // "Welcome — set your password" form.
  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { company_id, role: safeRole },
    redirectTo: `${process.env.NEXT_PUBLIC_PORTAL_URL ?? 'http://localhost:3001'}/auth/update-password?welcome=1`,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Pre-create / update the profile row so middleware can check
  // onboarding_completed and so company_id + role are correct from
  // the first sign-in.
  //
  // CRITICAL: don't use ignoreDuplicates here. Supabase's auth trigger
  // (handle_new_user, migration 001) inserts a profile row with just
  // (id, email) the moment inviteUserByEmail creates the auth.users
  // row. By the time we get here that row exists, so ignoreDuplicates
  // would skip our update — leaving company_id NULL and role at the
  // column default (client_editor). The upsert WITHOUT ignoreDuplicates
  // updates the existing row with the right company_id + role.
  await adminClient.from('profiles').upsert({
    id:                   data.user.id,
    email,
    full_name:            full_name || null,
    company_id,
    role:                 safeRole,
    onboarding_completed: false,
    onboarding_step:      1,
  }, { onConflict: 'id' });

  auditLog({
    action: 'user.invited',
    actor_id: auth.userId,
    target_id: data.user.id,
    target_type: 'profile',
    metadata: { email, company_id, role: safeRole },
  });

  // Cache busting — without these, the freshly-added user doesn't
  // appear on /clients/[id] (cached via unstable_cache, 60s TTL),
  // /users (revalidate=30), or /dashboard (counts) until the TTL
  // expires. The client_detail cache uses a tag, so revalidateTag
  // is the right hammer there; the others are page-level and use
  // revalidatePath.
  revalidateTag(`client:${company_id}`);
  revalidatePath('/users');
  revalidatePath('/dashboard');
  revalidatePath(`/clients/${company_id}`);

  // Branded follow-up alongside Supabase's built-in magic-link email.
  // Supabase's email is functional (the auth token); this one is the
  // welcome — TPS branded, points at the portal sign-in, names the
  // company and role.
  const { data: companyRow } = await adminClient
    .from('companies').select('name').eq('id', company_id).single();
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://portal.thepeoplesystem.co.uk';
  await sendEmail(userInvitedEmail({
    to:          email,
    companyName: companyRow?.name ?? 'your company',
    roleLabel:   ROLE_LABELS[safeRole] ?? 'Editor',
    acceptUrl:   `${portalUrl}/auth/login`,
  }));

  return NextResponse.json({ success: true, user_id: data.user.id });
}
