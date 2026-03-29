import { NextRequest, NextResponse } from 'next/server';
import { authenticatePartnerKey } from '@/lib/partnerAuth';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// GET /api/partner/bd/leads
// Auth: Bearer ivl_... with bd_pipeline permission
// Returns: { leads: [{ company_name, company_location, roles[], sent_at }] }

export async function GET(req: NextRequest) {
  const auth = await authenticatePartnerKey(
    req.headers.get('authorization'),
    'bd_pipeline',
  );
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error }, { status: auth.status ?? 401 });
  }

  const supabase = createServerSupabaseClient();

  // Fetch prospect/contacted BD companies with their active roles
  const { data: companies, error: compErr } = await supabase
    .from('bd_companies')
    .select('id, company_name, notes, status, last_seen_at')
    .in('status', ['prospect', 'contacted'])
    .order('last_seen_at', { ascending: false });

  if (compErr) {
    return NextResponse.json({ error: compErr.message }, { status: 500 });
  }

  if (!companies?.length) {
    return NextResponse.json({ leads: [] });
  }

  const companyIds = companies.map(c => c.id);
  const { data: roles } = await supabase
    .from('bd_scanned_roles')
    .select('company_id, role_title, salary_text, location, working_model, source_board, date_posted')
    .in('company_id', companyIds)
    .eq('still_active', true);

  // Group roles by company
  const rolesByCompany: Record<string, any[]> = {};
  for (const r of roles ?? []) {
    if (!rolesByCompany[r.company_id]) rolesByCompany[r.company_id] = [];
    rolesByCompany[r.company_id].push({
      role_title: r.role_title,
      salary_text: r.salary_text,
      location: r.location,
      working_model: r.working_model,
      source_board: r.source_board,
      date_posted: r.date_posted,
    });
  }

  const leads = companies.map(c => ({
    company_name: c.company_name,
    company_location: c.notes ?? null,
    status: c.status,
    roles: rolesByCompany[c.id] ?? [],
    sent_at: c.last_seen_at,
  }));

  return NextResponse.json({ leads });
}
