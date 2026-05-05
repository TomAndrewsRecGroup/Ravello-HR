import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { auditLog } from '@/lib/audit';
import { PORTAL_INVITE_ROLES, ROLE_LABELS } from '@/lib/ui/statusMaps';
import { sendEmail, lastEmailError, userInvitedEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  const supabase = createServerSupabaseClient();

  const { email, company_id, role = 'client_admin', full_name } = await request.json();

  if (!email || !company_id) {
    return NextResponse.json({ error: 'email and company_id are required' }, { status: 400 });
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(company_id)) {
    return NextResponse.json({ error: 'Invalid company_id format' }, { status: 400 });
  }
  const { data: company, error: companyErr } = await supabase
    .from('companies').select('id, name').eq('id', company_id).single();
  if (companyErr || !company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

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

  // ── Check if this email already has a profile (re-invite path). ──
  // We look in profiles rather than auth.users so we can use our own
  // indexed column and avoid a paginated admin.listUsers() scan.
  const { data: existingProfile } = await adminClient
    .from('profiles')
    .select('id')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle();

  let userId: string;

  if (existingProfile?.id) {
    // Re-invite: user already exists in auth. We'll just regenerate
    // their invite token so the new link works.
    userId = existingProfile.id;
  } else {
    // New user: create the auth user silently (email_confirm=true so
    // they don't get Supabase's own confirmation email, and the magic-
    // link we generate later works without a separate confirmation step).
    const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      email_confirm: true,
      user_metadata: { company_id, role: safeRole },
    });

    if (createError || !createData?.user) {
      return NextResponse.json(
        { error: createError?.message ?? 'Could not create user.' },
        { status: 400 },
      );
    }
    userId = createData.user.id;
  }

  // ── Generate a 7-day invite token and store it on the profile. ──
  // This replaces the 1-hour access_token that Supabase's native
  // inviteUserByEmail embeds directly in the email link. The portal's
  // /auth/activate page validates this token and generates a fresh
  // Supabase magic link on-demand, so the 1-hour window only starts
  // when the client actually clicks — not when we sent the email.
  const inviteToken   = crypto.randomUUID();
  const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await adminClient.from('profiles').upsert({
    id:                      userId,
    email:                   email.toLowerCase().trim(),
    full_name:               full_name || null,
    company_id,
    role:                    safeRole,
    onboarding_completed:    false,
    onboarding_step:         1,
    invite_token:            inviteToken,
    invite_token_expires_at: inviteExpires,
  }, { onConflict: 'id' });

  auditLog({
    action:      'user.invited',
    actor_id:    auth.userId,
    target_id:   userId,
    target_type: 'profile',
    metadata:    { email, company_id, role: safeRole },
  });

  revalidateTag(`client:${company_id}`);
  revalidatePath('/users');
  revalidatePath('/dashboard');
  revalidatePath(`/clients/${company_id}`);

  // ── Send the branded invite email via Resend. ──
  // This is now the ONLY email the client receives — we no longer
  // rely on Supabase's native invite email (which embedded a
  // short-lived token). The link goes to /auth/activate which
  // validates the 7-day token and generates a fresh magic link.
  const portalUrl   = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://portal.thepeoplesystem.co.uk';
  const activateUrl = `${portalUrl}/auth/activate?token=${inviteToken}`;

  const emailResult = await sendEmail(userInvitedEmail({
    to:          email,
    companyName: (company as any).name ?? 'your company',
    roleLabel:   ROLE_LABELS[safeRole] ?? 'Admin',
    acceptUrl:   activateUrl,
  }));

  // Surface email-send failures to the admin UI instead of swallowing
  // them. The user / profile / token are already persisted, so the
  // invite link still works — but the admin needs to know to either
  // resend it or hand the link over manually.
  if (!emailResult) {
    const last = lastEmailError();
    const reason = !process.env.RESEND_API_KEY
      ? 'RESEND_API_KEY is not set on this Vercel project. The user record was created but no email was sent.'
      : last
        ? `Resend rejected the send (HTTP ${last.status}) from "${last.from}": ${last.message}`
        : 'Resend rejected the send. Check the Vercel function logs for details.';
    return NextResponse.json({
      success:        true,
      user_id:        userId,
      email_sent:     false,
      email_warning:  reason,
      activate_url:   activateUrl,
    });
  }

  return NextResponse.json({ success: true, user_id: userId, email_sent: true });
}
