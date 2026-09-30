import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { parseBody } from '@/lib/validation/parseBody';
import { z, optionalShortText } from '@/lib/validation/primitives';
import { limiters, getUserRateLimitKey, rateLimitResponse } from '@/lib/rateLimit';
import { tavilySearch, summariseResults, defaultQueryFor } from '@/lib/tavily/client';

export const runtime = 'nodejs';

// POST /api/admin/legal-register/[id]/research — Core-OS 360 Phase 17.
// Runs ONE Tavily web search for a legal requirement and records what
// came back as a NEW legal_requirement_research_notes row. Tavily
// never decides anything here — raw_result_summary is a verbatim join
// of its own titles/urls/content (summariseResults()), never an
// AI-generated paraphrase, and nothing in this route ever writes
// organisation_legal_obligations.applicability_status or
// compliance_evaluations.status. Staff-only (this whole table is
// staff-only RLS, migration 159) and on-demand only — there is no
// scheduled cron calling this, deliberately, per the plan doc.
//
// query_used matches legal_requirement_research_notes.query_used's own
// 500-char DB CHECK exactly (optionalShortText(500)) — never a
// narrower ceiling invented for this route alone.
const Body = z.object({ query: optionalShortText(500) });

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  const params = await props.params;

  const rl = limiters.vendor.check(getUserRateLimitKey(req, auth.userId));
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  const parsed = await parseBody(req, Body);
  if (!parsed.ok) return parsed.response;
  const supabase = await createServerSupabaseClient();

  const { data: requirement } = await supabase.from('legal_requirements')
    .select('id, title, jurisdiction').eq('id', params.id).maybeSingle();
  if (!requirement) return NextResponse.json({ error: 'Legal requirement not found' }, { status: 404 });

  const query = parsed.data.query ?? defaultQueryFor(requirement.title, requirement.jurisdiction);
  const outcome = await tavilySearch(query);

  if (outcome.error || !outcome.results) {
    return NextResponse.json({ error: outcome.error ?? 'Tavily search failed' }, { status: 502 });
  }

  const { data: note, error } = await supabase.from('legal_requirement_research_notes').insert({
    legal_requirement_id: requirement.id, source: 'tavily', query_used: query,
    raw_result_summary: summariseResults(outcome.results),
  }).select('id, legal_requirement_id, source, query_used, raw_result_summary, reviewed_by, reviewed_at, action_taken, created_by, created_at').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ note });
}
