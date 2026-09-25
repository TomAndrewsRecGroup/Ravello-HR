import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { parseBody } from '@/lib/validation/parseBody';
import { optionalLongText, shortText, uuid, z } from '@/lib/validation/primitives';
import { askJev } from '@/lib/jev/client';
import { CLASSIFY_SUGGEST_GATE, classifyItemQuestions, classifyItemState, toClassifySuggestion } from '@/lib/hs/jevQuestions';
import { limiters, getUserRateLimitKey, rateLimitResponse } from '@/lib/rateLimit';

// POST /api/hs/jev/classify-item — suggest category, recurrence and
// legal basis for a register item from its title and notes.
//
// Staff only (2026-09-25 — Core OS 360 staff deliver H&S directly, and
// this route never had a client caller). A suggestion only: this route
// never writes compliance_items. The jev_decisions row is inserted
// under the actor policy (098). Jev off → { suggestion: null }, and the
// form simply has no button result — the IvyLens "not configured"
// precedent.

export const runtime = 'nodejs';

const Body = z.object({
  company_id:  uuid,
  title:       shortText(200),
  description: optionalLongText(4_000),
});

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  const rl = limiters.vendor.check(getUserRateLimitKey(req, auth.userId));
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  const parsed = await parseBody(req, Body);
  if (!parsed.ok) return parsed.response;
  const { company_id, title, description } = parsed.data;

  const supabase = await createServerSupabaseClient();
  const result = await askJev(supabase, {
    kind: 'hs_item_classify', companyId: company_id, entityType: 'compliance_item', entityId: null,
    actor: { id: auth.userId, kind: 'staff' },
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
