import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { getSessionProfile } from '@/lib/supabase/server';
import { sendEmail, buildInviteEmail } from '@/lib/email';

const SEAT_CAP = 2;

const ROLE_LABELS: Record<string, string> = {
  client_admin:  'Admin',
  client_editor: 'Editor',
};

export async function POST(request: NextRequest) {
  try {
    const { user, role, companyId } = await getSessionProfile();

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

  // ── Seat cap ──────────────────────────────────────────────────
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

  // ── Get company name for the email ────────────────────────────
  const { data: companyRow } = await adminClient
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .maybeSingle();

  // ── Create or re-invite user ──────────────────────────────────
  // Check if user already exists in profiles (re-invite path).
  const { data: existingProfile } = await adminClient
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  let userId: string;

  if (existingProfile?.id) {
    userId = existingProfile.id;
  } else {
    // New user: create silently (email_confirm=true so no Supabase email
    // is sent and the magic link we generate on activation works immediately).
    const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { company_id: companyId, role: 'client_editor' },
    });

    if (createError || !createData?.user) {
      return NextResponse.json(
        { error: createError?.message ?? 'Could not create user.' },
        { status: 400 },
      );
    }
    userId = createData.user.id;
  }

  // ── Generate 7-day invite token ───────────────────────────────
  const inviteToken   = crypto.randomUUID();
  const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await adminClient.from('profiles').upsert({
    id:                      userId,
    email,
    full_name,
    company_id:              companyId,
    role:                    'client_editor',
    onboarding_completed:    false,
    onboarding_step:         0,
    invite_token:            inviteToken,
    invite_token_expires_at: inviteExpires,
  }, { onConflict: 'id' });

  // ── Send branded invite email via Resend ──────────────────────
  const portalUrl   = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://portal.thepeoplesystem.co.uk';
  const activateUrl = `${portalUrl}/auth/activate?token=${inviteToken}`;

  await sendEmail(buildInviteEmail({
    to:          email,
    companyName: companyRow?.name ?? 'your company',
    roleLabel:   ROLE_LABELS['client_editor'],
    activateUrl,
  }));

    return NextResponse.json({ success: true, user_id: userId });
  } catch (err) {
    console.error('[/api/portal/invite] unexpected error:', err);
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
