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

  const { email, password, company_id, full_name } = await request.json();

  if (!email || !password || !company_id) {
    return NextResponse.json({ error: 'email, password and company_id are required' }, { status: 400 });
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

  // ── Password strength: min 8 chars, must contain uppercase, lowercase, and digit ──
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return NextResponse.json({ error: 'Password must contain at least one uppercase letter, one lowercase letter, and one digit' }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Create user with password via Admin API
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // auto-confirm so they can log in immediately
    user_metadata: { company_id, role: 'client_admin', full_name },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Create profile row
  await adminClient.from('profiles').upsert({
    id: data.user.id,
    email,
    full_name: full_name || null,
    company_id,
    role: 'client_admin',
    onboarding_completed: true,
  }, { onConflict: 'id', ignoreDuplicates: false });

  return NextResponse.json({ success: true, user_id: data.user.id });
}
