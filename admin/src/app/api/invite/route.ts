import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const { email, company_id, role = 'client_admin', full_name } = await request.json();

  if (!email || !company_id) {
    return NextResponse.json({ error: 'email and company_id are required' }, { status: 400 });
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
