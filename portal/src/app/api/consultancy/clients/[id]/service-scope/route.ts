import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requirePortfolioSession, portfolioIncludes } from '@/lib/consultancy/portfolioAccess';
import { parseBody } from '@/lib/validation/parseBody';
import { z, enumOf, isoDate, optionalIsoDate, optionalLongText, optionalShortText } from '@/lib/validation/primitives';
import { SERVICE_TYPES, REVIEW_FREQUENCIES } from '@/lib/consultancy/vocab';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BODY = z.object({
  service_type:         enumOf(SERVICE_TYPES),
  start_date:           isoDate,
  end_date:             optionalIsoDate,
  review_frequency:     enumOf(REVIEW_FREQUENCIES).optional().nullable().transform(v => v || null),
  included_scope:       optionalLongText(2000),
  excluded_scope:       optionalLongText(2000),
  commercial_reference: optionalShortText(200),
});

// POST /api/consultancy/clients/[id]/service-scope
//
// Core-OS 360 Phase 6, Group 7. Section 5 says the model "must make
// consultant responsibility clear" — this is the write path that
// actually populates it. consultancy_service_scopes (168) has had a
// portfolio-wide, RLS-enforced write policy since Group 2
// (consultancy_service_scopes_consultancy_write: my_home_company_id()
// + has_capability(client_organisation_id, 'consultancy.service_manage'),
// never gated on the currently active organisation) but no page ever
// called it until now.
//
// The write runs under the caller's OWN session, never the service
// role — RLS is the real authorization boundary; requirePortfolioSession()
// + portfolioIncludes() here is only a cheap early 404 for a client the
// caller cannot even read, not the write gate itself. service_scope.
// created/updated already fires from the DB's own audit_row trigger
// (168) — no app-level audit call needed here.
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

  const { data, error } = await supabase.from('consultancy_service_scopes').insert({
    consultancy_organisation_id: homeId,
    client_organisation_id:      id,
    service_type:                body.service_type,
    start_date:                  body.start_date,
    end_date:                    body.end_date,
    review_frequency:            body.review_frequency,
    included_scope:              body.included_scope,
    excluded_scope:               body.excluded_scope,
    commercial_reference:        body.commercial_reference,
  }).select('id').single();

  if (error) {
    const refused = error.code === '42501';
    return NextResponse.json(
      { error: refused ? "You do not have permission to manage this client's service scope." : error.message },
      { status: refused ? 403 : 500 },
    );
  }

  return NextResponse.json({ ok: true, id: data.id });
}
