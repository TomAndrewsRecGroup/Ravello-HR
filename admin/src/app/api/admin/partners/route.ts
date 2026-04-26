import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { normaliseRoleOpportunities, normaliseWebsite } from '@/lib/partners/roleOpportunities';

export const runtime = 'nodejs';

interface PostBody {
  company_name?: string;
  locations?: string | null;
  industry?: string | null;
  website?: string | null;
  role_opportunities?: unknown;
  active?: boolean;
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  let body: PostBody;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const company_name = (body.company_name ?? '').trim();
  if (!company_name) {
    return NextResponse.json({ error: 'company_name is required' }, { status: 400 });
  }

  const roles = normaliseRoleOpportunities(body.role_opportunities, []);
  if (!roles.ok) return NextResponse.json({ error: roles.error }, { status: 400 });

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('partners')
    .insert({
      company_name: company_name.slice(0, 200),
      locations: body.locations?.trim()?.slice(0, 500) || null,
      industry: body.industry?.trim()?.slice(0, 200) || null,
      website: normaliseWebsite(body.website),
      role_opportunities: roles.value,
      active: body.active ?? true,
      created_by: auth.userId,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
