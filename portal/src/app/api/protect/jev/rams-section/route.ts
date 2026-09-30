import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { parseBody } from '@/lib/validation/parseBody';
import { optionalShortText, shortText, longText, z } from '@/lib/validation/primitives';
import { askJev } from '@/lib/jev/client';
import { ramsSectionQuestions, ramsSectionState, toRamsSectionSuggestions } from '@/lib/hs/ramsSectionQuestions';
import { limiters, getUserRateLimitKey, rateLimitResponse } from '@/lib/rateLimit';

// POST /api/protect/jev/rams-section — Core-OS 360 Phase 15: Intelligent
// RAMS. Suggests which CONDITIONAL method-statement sections a draft's
// scope of work likely needs real content in — never what that content
// should say (Jev cannot draft free text, only answer bounded
// questions — see lib/hs/ramsSectionQuestions.ts's own header comment).
// Own session, company from the session; a suggestion only — this
// route never writes method_statements.

export const runtime = 'nodejs';

const Body = z.object({
  title: shortText(200),
  project_name: optionalShortText(200),
  scope_of_work: longText(4000),
});

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { companyId, featureFlags } = await getSessionProfile();
  if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 403 });

  const rl = limiters.vendor.check(getUserRateLimitKey(req, user.id));
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  const parsed = await parseBody(req, Body);
  if (!parsed.ok) return parsed.response;

  const result = await askJev(supabase, {
    kind: 'rams_section_suggest', companyId, entityType: 'method_statement', entityId: null,
    actor: { id: user.id, kind: 'client' }, flags: (featureFlags ?? null) as Record<string, unknown> | null,
    state: ramsSectionState(parsed.data.title, parsed.data.project_name ?? null, parsed.data.scope_of_work),
    questions: ramsSectionQuestions(),
  });
  if (!result) return NextResponse.json({ suggested_sections: [], decision_id: null, reason: 'unavailable' });

  const selected: Record<string, string | number> = {};
  for (const [k, a] of Object.entries(result.answers)) selected[k] = a.type === 'noul' ? a.probability : a.selected;

  return NextResponse.json({ suggested_sections: toRamsSectionSuggestions(selected), decision_id: result.decisionId, reason: null });
}
