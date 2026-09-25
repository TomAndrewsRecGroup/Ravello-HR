import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { parseBody } from '@/lib/validation/parseBody';
import { optionalShortText, shortText, z } from '@/lib/validation/primitives';
import { askJev } from '@/lib/jev/client';
import { DOC_TYPE_SUGGEST_GATE, docTypeQuestions, docTypeState, toDocTypeSuggestion } from '@/lib/lead/docTypeQuestions';
import { limiters, getUserRateLimitKey, rateLimitResponse } from '@/lib/rateLimit';

// POST /api/lead/jev/doc-type — suggest an employee-document type
// from its title. Own session, company from the session; a suggestion
// only — this route never writes employee_documents.

export const runtime = 'nodejs';

const Body = z.object({ title: shortText(200), file_name: optionalShortText(300) });

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { companyId, featureFlags } = await getSessionProfile();
  if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 403 });

  const rl = limiters.vendor.check(getUserRateLimitKey(req, user.id));
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  const parsed = await parseBody(req, Body);
  if (!parsed.ok) return parsed.response;

  const result = await askJev(supabase, {
    kind: 'doc_type_suggest', companyId, entityType: 'employee_document', entityId: null,
    actor: { id: user.id, kind: 'client' }, flags: (featureFlags ?? null) as Record<string, unknown> | null,
    state: docTypeState(parsed.data.title, parsed.data.file_name ?? null), questions: docTypeQuestions(), gate: DOC_TYPE_SUGGEST_GATE,
  });
  if (!result) return NextResponse.json({ suggestion: null, decision_id: null, reason: 'unavailable' });

  const selected: Record<string, string | number> = {};
  for (const [k, a] of Object.entries(result.answers)) selected[k] = a.type === 'noul' ? a.probability : a.selected;
  const suggestion = result.gated ? null : toDocTypeSuggestion(selected, result.confidence);
  return NextResponse.json({ suggestion, decision_id: result.decisionId, reason: result.gated ? 'unsure' : suggestion ? null : 'invalid' });
}
