import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requirePortfolioSession, portfolioIncludes } from '@/lib/consultancy/portfolioAccess';
import { parseBody } from '@/lib/validation/parseBody';
import { z, optionalIsoDate } from '@/lib/validation/primitives';
import { auditLog } from '@/lib/audit';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Free text, but never empty — longText() alone has no floor, and a
// manual ledger entry with nothing in it is not a real record.
const BODY = z.object({
  summary:     z.string().trim().min(1, 'Required').max(1000, 'Must be 1000 characters or fewer'),
  occurred_at: optionalIsoDate,
});

// POST /api/consultancy/clients/[id]/ledger-entry
//
// Core-OS 360 Phase 6, Group 7. Section 9: "Ledger entries should
// originate from real platform events OR AUTHORISED MANUAL SERVICE
// ENTRIES" — the automated path (lib/events/serviceLedgerRules.ts) has
// existed since Group 3; this is the manual half, using the RLS policy
// migration 169 already built for exactly this
// (consultancy_service_ledger_consultancy_manual_insert: entry_type
// forced to 'manual', source_type/source_id forced NULL, created_by
// forced to auth.uid() — all enforced by the WITH CHECK, not by this
// route). The insert runs under the caller's own session so that
// policy is the real boundary.
//
// service_ledger.entry_created does NOT ride a DB audit_row trigger
// (its spec verb doesn't match the generic <entity>.<created|updated|
// deleted> shape audit_row() produces — see migration 172's own header
// comment) — it is fired explicitly here, and separately from the
// admin-side automated path (lib/events/serviceLedgerRules.ts).
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const portfolio = await requirePortfolioSession();
  if (!portfolio) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!portfolioIncludes(portfolio.organisations, id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = await parseBody(req, BODY);
  if (!parsed.ok) return parsed.response;
  const { summary, occurred_at } = parsed.data;

  const supabase = await createServerSupabaseClient();
  const { data: homeId, error: homeErr } = await supabase.rpc('my_home_company_id');
  if (homeErr || !homeId) return NextResponse.json({ error: 'Could not resolve your organisation' }, { status: 500 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase.from('consultancy_service_ledger').insert({
    consultancy_organisation_id: homeId,
    client_organisation_id:      id,
    entry_type:                  'manual',
    summary,
    occurred_at:                 occurred_at ?? new Date().toISOString(),
    created_by:                  user.id,
  }).select('id').single();

  if (error) {
    const refused = error.code === '42501';
    return NextResponse.json(
      { error: refused ? "You do not have permission to add a ledger entry for this client." : error.message },
      { status: refused ? 403 : 500 },
    );
  }

  auditLog({
    action:          'service_ledger.entry_created',
    actor_id:        user.id,
    target_id:        data.id,
    target_type:      'consultancy_service_ledger',
    organisation_id:  id,
    metadata:         { entry_type: 'manual' },
  });

  return NextResponse.json({ ok: true, id: data.id });
}
