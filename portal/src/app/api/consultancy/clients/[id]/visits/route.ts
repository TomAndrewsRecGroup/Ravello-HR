import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requirePortfolioSession, portfolioIncludes } from '@/lib/consultancy/portfolioAccess';
import { parseBody } from '@/lib/validation/parseBody';
import { z, enumOf, isoDate, optionalUuid } from '@/lib/validation/primitives';
import { VISIT_TYPES } from '@/lib/consultancy/vocab';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BODY = z.object({
  visit_type:   enumOf(VISIT_TYPES),
  scheduled_date: isoDate,
  template_id:  optionalUuid,
  site_id:      optionalUuid,
});

// POST /api/consultancy/clients/[id]/visits
//
// Core-OS 360 Phase 7, Group 2 (section 3: "Using [a template] creates
// a client-owned visit instance"). Runs under the caller's OWN
// session — consultancy_visits_consultancy_write (168) is the real
// authorization boundary (consultancy.service_manage, portfolio-wide).
//
// A given template_id is verified by READING it under RLS first,
// never trusted from the request: consultancy_visit_templates_
// consultancy_read (173) already refuses a template belonging to a
// DIFFERENT consultancy, so a null result here means either it does
// not exist or it is not this caller's own — either way, refused.
//
// previous_visit_id is resolved SERVER-SIDE from the client's own most
// recent closed/report_issued visit, never taken from the request body
// — a client could otherwise be pointed at a visit for a different
// client (consultancy_visit_previous_guard, 173, would refuse a
// cross-client id, but there is no reason to ask the caller to get
// this right when the server already knows the correct answer).
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const portfolio = await requirePortfolioSession();
  if (!portfolio) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!portfolioIncludes(portfolio.organisations, id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = await parseBody(req, BODY);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const supabase = await createServerSupabaseClient();
  const { data: homeId, error: homeErr } = await supabase.rpc('my_home_company_id');
  if (homeErr || !homeId) return NextResponse.json({ error: 'Could not resolve your organisation' }, { status: 500 });

  if (body.template_id) {
    const { data: template } = await supabase.from('consultancy_visit_templates')
      .select('id').eq('id', body.template_id).maybeSingle();
    if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  const { data: prior } = await supabase.from('consultancy_visits')
    .select('id').eq('client_organisation_id', id).in('status', ['closed', 'report_issued'])
    .order('scheduled_date', { ascending: false }).limit(1).maybeSingle();

  const { data, error } = await supabase.from('consultancy_visits').insert({
    consultancy_organisation_id: homeId,
    client_organisation_id:      id,
    visit_type:                  body.visit_type,
    scheduled_date:               body.scheduled_date,
    template_id:                 body.template_id,
    site_id:                     body.site_id,
    previous_visit_id:           prior?.id ?? null,
    status:                      'planned',
  }).select('id').single();

  if (error) {
    const refused = error.code === '42501';
    return NextResponse.json(
      { error: refused ? 'You do not have permission to book a visit for this client.' : error.message },
      { status: refused ? 403 : 500 },
    );
  }

  return NextResponse.json({ ok: true, id: data.id });
}
