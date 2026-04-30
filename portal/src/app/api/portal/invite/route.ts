import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { getSessionProfile } from '@/lib/supabase/server';

// Seat cap: every client gets 2 portal users (1 Admin + 1 Editor).
// Anything beyond that is a paid upgrade — handled separately when
// the Stripe billing integration lands. Until then, this endpoint
// hard-refuses the third invite.
const SEAT_CAP = 2;

export async function POST(request: NextRequest) {
  try {
    const { user, role, companyId } = await getSessionProfile();

    // Only the company's existing Admin can invite. Editors cannot.
    if (!user) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }
    if (role !== 'client_admin') {
      return NextResponse.json({ error: `Only the company Admin can invite team members. Your role: ${role || 'unknown'}.` }, { status: 403 });
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
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceKey || !supabaseUrl) {
      console.error('[/api/portal/invite] env missing', { hasServiceKey: !!serviceKey, hasUrl: !!supabaseUrl });
      return NextResponse.json({
        error: `Server config missing: ${!serviceKey ? 'SUPABASE_SERVICE_ROLE_KEY ' : ''}${!supabaseUrl ? 'NEXT_PUBLIC_SUPABASE_URL' : ''}`.trim(),
      }, { status: 500 });
    }

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── Seat cap check: count current portal users on this company ──
    const { count: seatCount, error: countErr } = await adminClient
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('role', ['client_admin', 'client_editor']);

    if (countErr) {
      console.error('[/api/portal/invite] seat count failed:', countErr);
      return NextResponse.json({ error: `Could not check your seat count: ${countErr.message}` }, { status: 500 });
    }
    if ((seatCount ?? 0) >= SEAT_CAP) {
      return NextResponse.json({
        error: 'You have reached your seat limit. Contact The People System to add more seats.',
        code:  'seat_cap_reached',
      }, { status: 409 });
    }

    // ── Invite via Supabase Auth Admin API ──
    const { data, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { company_id: companyId, role: 'client_editor' },
      redirectTo: `${process.env.NEXT_PUBLIC_PORTAL_URL ?? 'http://localhost:3001'}/auth/accept-invite?email=${encodeURIComponent(email)}`,
    });

    if (inviteErr) {
      console.error('[/api/portal/invite] inviteUserByEmail failed:', inviteErr);
      return NextResponse.json({ error: inviteErr.message }, { status: 400 });
    }
    if (!data?.user?.id) {
      return NextResponse.json({ error: 'Supabase returned no user from inviteUserByEmail.' }, { status: 502 });
    }

    // Pre-create the profile row so the layout's onboarding redirect works
    // for the new user on first sign-in. Surface DB errors instead of
    // swallowing them — a silent upsert failure leaves the new user with
    // company_id NULL and they bounce off the onboarding redirect.
    const { error: upsertErr } = await adminClient.from('profiles').upsert({
      id:                   data.user.id,
      email,
      full_name,
      company_id:           companyId,
      role:                 'client_editor',
      onboarding_completed: false,
      onboarding_step:      0,
    }, { onConflict: 'id' });

    if (upsertErr) {
      console.error('[/api/portal/invite] profiles upsert failed:', upsertErr);
      return NextResponse.json({ error: `Profile write failed: ${upsertErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, user_id: data.user.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[/api/portal/invite] unhandled:', err);
    return NextResponse.json({ error: `Invite failed: ${msg}` }, { status: 500 });
  }
}
