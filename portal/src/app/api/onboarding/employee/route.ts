import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';

// Inserts the first employee for a company during onboarding.
// Lightweight payload (full_name + email + start_date + job_title) —
// the full Employee Records page captures everything else later.
//
// Scoped to the caller's company via getSessionProfile + RLS — there
// is no way for a client to seed an employee onto another company.

export async function POST(request: NextRequest) {
  const { user, companyId } = await getSessionProfile();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }
  if (!companyId) {
    return NextResponse.json({ error: 'Your account is not linked to a company.' }, { status: 400 });
  }

  let body: { full_name?: string; email?: string; job_title?: string; start_date?: string } = {};
  try { body = await request.json(); } catch { /* ignore */ }

  const full_name  = (body.full_name ?? '').trim();
  const email      = (body.email ?? '').trim().toLowerCase() || null;
  const job_title  = (body.job_title ?? '').trim() || 'Employee';
  const start_date = (body.start_date ?? '').trim();

  if (!full_name) {
    return NextResponse.json({ error: 'Employee name is required.' }, { status: 400 });
  }
  if (!start_date || !/^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
    return NextResponse.json({ error: 'A valid start date is required (YYYY-MM-DD).' }, { status: 400 });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'That email does not look right.' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('employee_records')
    .insert({
      company_id: companyId,
      full_name,
      email,
      job_title,
      start_date,
      status: 'active',
    })
    .select('id')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, employee_id: data.id });
}
