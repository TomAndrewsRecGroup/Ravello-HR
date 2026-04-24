import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { normaliseRoleOpportunities, normaliseWebsite, type RoleOpportunity } from '@/lib/partners/roleOpportunities';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PatchBody {
  company_name?: string;
  locations?: string | null;
  industry?: string | null;
  website?: string | null;
  role_opportunities?: unknown;
  active?: boolean;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  let body: PatchBody;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.company_name !== undefined) {
    const v = body.company_name.trim();
    if (!v) return NextResponse.json({ error: 'company_name cannot be empty' }, { status: 400 });
    patch.company_name = v.slice(0, 200);
  }
  if (body.locations !== undefined) patch.locations = body.locations?.trim()?.slice(0, 500) || null;
  if (body.industry !== undefined) patch.industry = body.industry?.trim()?.slice(0, 200) || null;
  if (body.website !== undefined) patch.website = body.website ? normaliseWebsite(body.website) : null;
  if (body.active !== undefined) patch.active = !!body.active;

  if (body.role_opportunities !== undefined) {
    const { data: existing } = await supabase
      .from('partners')
      .select('role_opportunities')
      .eq('id', params.id)
      .single();
    const existingRoles = (existing?.role_opportunities as RoleOpportunity[] | null) ?? [];
    const roles = normaliseRoleOpportunities(body.role_opportunities, existingRoles);
    if (!roles.ok) return NextResponse.json({ error: roles.error }, { status: 400 });
    patch.role_opportunities = roles.value;
  }

  const { error } = await supabase.from('partners').update(patch).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from('partners').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
