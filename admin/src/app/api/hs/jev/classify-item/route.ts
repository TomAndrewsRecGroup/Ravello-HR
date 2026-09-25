import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { parseBody } from '@/lib/validation/parseBody';
import { optionalLongText, shortText, uuid, z } from '@/lib/validation/primitives';
import { myGrant } from '@/lib/hs/access';
import { askJev } from '@/lib/jev/client';
import { CLASSIFY_SUGGEST_GATE, classifyItemQuestions, classifyItemState, toClassifySuggestion } from '@/lib/hs/jevQuestions';
import { limiters, getUserRateLimitKey, rateLimitResponse } from '@/lib/rateLimit';

// POST /api/hs/jev/classify-item — suggest category, recurrence and
// legal basis for a register item from its title and notes.
//
// Under app/api/hs, so: the user's OWN session (no service role — a
// provider reaches this route), the company from hs_my_companies(),
// and a suggestion only: this route never writes compliance_items.
// The jev_decisions row is inserted under the actor policy (098).
// Jev off → { suggestion: null }, and the form simply has no button
// result — the IvyLens "not configured" precedent.

export const runtime = 'nodejs';

const Body = z.object({
  company_id:  uuid,
  title:       shortText(200),
  description: optionalLongText(4_000),
});

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = limiters.vendor.check(getUserRateLimitKey(req, user.id));
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  const parsed = await parseBody(req, Body);
  if (!parsed.ok) return parsed.response;
  const { company_id, title, description } = parsed.data;

  const grant = await myGrant(supabase, company_id);
  if (!grant || !grant.scopes.includes('register')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: role } = await supabase.rpc('get_my_role');
  const actorKind = role === 'tps_admin' ? 'staff' : role === 'hs_provider' ? 'provider' : 'client';

  const result = await askJev(supabase, {
    kind: 'hs_item_classify', companyId: company_id, entityType: 'compliance_item', entityId: null,
    actor: { id: user.id, kind: actorKind },
    state: classifyItemState(title, description ?? null),
    questions: classifyItemQuestions(),
    gate: CLASSIFY_SUGGEST_GATE,
  });
  if (!result) return NextResponse.json({ suggestion: null, decision_id: null, reason: 'unavailable' });

  const selected: Record<string, string> = {};
  for (const [k, a] of Object.entries(result.answers)) if (a.type !== 'noul') selected[k] = a.selected;
  const suggestion = result.gated ? null : toClassifySuggestion(selected, result.confidence);
  return NextResponse.json({
    suggestion, decision_id: result.decisionId,
    reason: result.gated ? 'unsure' : suggestion ? null : 'invalid',
    confidence: result.confidence,
  });
}
