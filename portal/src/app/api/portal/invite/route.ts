import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { getSessionProfile } from '@/lib/supabase/server';

// Seat cap: every client gets 2 portal users (1 Admin + 1 Editor).
// Anything beyond that is a paid upgrade — handled separately when
// the Stripe billing integration lands. Until then, this endpoint
// hard-refuses the third invite.
const SEAT_CAP = 2;

export async function POST(request: NextRequest) {
  const { user, role, companyId } = await getSessionProfile();

  // Only the company's existing Admin can invite. Editors cannot.
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }
  if (role !== 'client_admin') {
    return NextResponse.json({ error: 'Only the company Admin can invite team members.' }, { status: 403 });
  }
  if (!companyId) {
    return NextResponse.json({ error: 'Your account is not linked to a company.' }, { status: 400 });
  }

  let body: { email?: string; full_name?: string } = {};
  try { body = await request.json(); } catch { /* ignore */ }
  const email     = (body.email ?? '').trim().toLowerCase();
  const full_name = (body.full_name ?? '').trim() || null;

  if (!email) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'That email does not look right.' }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: 'Server is missing required configuration.' }, { status: 500 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // ── Seat cap check: count current portal users on this company ──
  // Counts Admin + Editor profiles pinned to this company. Migration
  // 049 retired client_user / client_viewer (any leftover rows are
  // migrated to client_editor on apply).
  const { count: seatCount, error: countErr } = await adminClient
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .in('role', ['client_admin', 'client_editor']);

  if (countErr) {
    return NextResponse.json({ error: 'Could not check your seat count.' }, { status: 500 });
  }
  if ((seatCount ?? 0) >= SEAT_CAP) {
    return NextResponse.json({
      error: 'You have reached your seat limit. Contact The People System to add more seats.',
      code:  'seat_cap_reached',
    }, { status: 409 });
  }

  // ── Invite via Supabase Auth Admin API ──
  // Role is forced to 'client_editor' — clients can only invite Editors
  // from their portal. The original Admin seat is created when TPS
  // staff onboard the client through the admin app's invite endpoint.
  // Supabase returns invites in IMPLICIT FLOW (auth tokens in the URL
  // hash). Server-side routes can't read hashes, so we redirect direct
  // to /auth/update-password where the client component handles it.
  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { company_id: companyId, role: 'client_editor' },
    redirectTo: `${process.env.NEXT_PUBLIC_PORTAL_URL ?? 'http://localhost:3001'}/auth/update-password?welcome=1`,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Pre-create the profile row so the layout's onboarding redirect works
  // for the new user on first sign-in.
  await adminClient.from('profiles').upsert({
    id:                   data.user.id,
    email,
    full_name,
    company_id:           companyId,
    role:                 'client_editor',
    onboarding_completed: false,
    onboarding_step:      0,
  }, { onConflict: 'id', ignoreDuplicates: true });

  return NextResponse.json({ success: true, user_id: data.user.id });
}
