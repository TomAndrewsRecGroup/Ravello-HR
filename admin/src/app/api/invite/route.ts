import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  // Auth check — verify caller is ravello staff
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single();
  const callerRole = (profile as any)?.role ?? '';
  if (!['tps_admin', 'tps_client'].includes(callerRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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

  const allowedRoles = ['client_admin', 'client_viewer'];
  const safeRole = allowedRoles.includes(role) ? role : 'client_admin';

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Invite via Supabase Auth Admin API — sends a magic-link invite email
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

  return NextResponse.json({ success: true, user_id: data.user.id });
}
