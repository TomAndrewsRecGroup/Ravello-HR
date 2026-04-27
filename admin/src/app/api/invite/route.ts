import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { auditLog } from '@/lib/audit';
import { PORTAL_INVITE_ROLES } from '@/lib/ui/statusMaps';

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

  // Invite via Supabase Auth Admin API: sends a magic-link invite email
  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { company_id, role: safeRole },
    redirectTo: `${process.env.NEXT_PUBLIC_PORTAL_URL ?? 'http://localhost:3001'}/auth/callback?next=/onboarding`,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Pre-create the profile row so middleware can check onboarding_completed
  await adminClient.from('profiles').upsert({
    id:                   data.user.id,
    email,
    full_name:            full_name || null,
    company_id,
    role:                 safeRole,
    onboarding_completed: false,
    onboarding_step:      1,
  }, { onConflict: 'id', ignoreDuplicates: true });

  auditLog({
    action: 'user.invited',
    actor_id: auth.userId,
    target_id: data.user.id,
    target_type: 'profile',
    metadata: { email, company_id, role: safeRole },
  });

  return NextResponse.json({ success: true, user_id: data.user.id });
}
