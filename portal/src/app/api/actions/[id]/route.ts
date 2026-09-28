import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { effectiveCompanyId } from '@/lib/auth/activeOrganisation';
import { parseBody } from '@/lib/validation/parseBody';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PATCH /api/actions/[id]
//
//   { op: 'complete' }   → done. An action that must be verified (125:
//                          every corrective action from a major, critical
//                          or fatal incident, or one flagged by its
//                          assigner) goes to awaiting_verification — a
//                          different person verifies it. The response
//                          says which happened.
//   { op: 'dismiss_7d' } → snooze for 7 days (assigners only, 126).
//
// The organisation is the ACTIVE one (a consultant works in a client's),
// never the home company. The write runs under the caller's own session:
// RLS and the 126 party guard decide, and a refused or zero-row write is
// reported as refused, never as success.
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const { user } = await getSessionProfile();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = await parseBody(req, z.object({ op: z.enum(['complete', 'dismiss_7d']) }));
  if (!parsed.ok) return parsed.response;
  const { op } = parsed.data;

  const supabase = await createServerSupabaseClient();
  const companyId = await effectiveCompanyId(supabase);
  if (!companyId) return NextResponse.json({ error: 'no company assigned' }, { status: 403 });

  const { data: action, error: lookupErr } = await supabase
    .from('actions')
    .select('id, company_id, status, verification_required, evidence_required')
    .eq('id', params.id)
    .maybeSingle();
  if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  if (!action || action.company_id !== companyId) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  let patch: Record<string, unknown>;
  let result: 'complete' | 'awaiting_verification' | 'snoozed';
  if (op === 'complete') {
    if (!['active', 'in_progress'].includes(action.status)) {
      return NextResponse.json({ error: `This action is already ${String(action.status).replace(/_/g, ' ')}.` }, { status: 409 });
    }
    if (action.evidence_required) {
      return NextResponse.json({ error: 'This action needs completion evidence — open it to add the evidence.' }, { status: 422 });
    }
    result = action.verification_required ? 'awaiting_verification' : 'complete';
    patch = { status: result };
  } else {
    const until = new Date();
    until.setDate(until.getDate() + 7);
    patch = { dismiss_until: until.toISOString() };
    result = 'snoozed';
  }

  const res = await supabase.from('actions').update(patch, COUNT_EXACT)
    .eq('id', params.id).eq('status', action.status);
  const outcome = judgeWrite({ error: res.error, count: res.count }, 'The action');
  if (!outcome.ok) {
    const refused = res.error?.code === '42501' || res.count === 0;
    return NextResponse.json({ error: outcome.message }, { status: refused ? 403 : 500 });
  }

  return NextResponse.json({ ok: true, status: result });
}
