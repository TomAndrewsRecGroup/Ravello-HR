import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { parseBody } from '@/lib/validation/parseBody';
import { enumOf, uuid, z } from '@/lib/validation/primitives';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';

// POST /api/hs/jev/outcome — what the person did with a suggestion.
// The label stream the eval harness scores against. Own session; RLS
// (098) lets the actor or staff write human_outcome and the guard
// trigger refuses any other column.

export const runtime = 'nodejs';

const Body = z.object({
  decision_id: uuid,
  outcome:     enumOf(['accepted', 'overridden', 'ignored']),
});

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = await parseBody(req, Body);
  if (!parsed.ok) return parsed.response;

  const res = await supabase.from('jev_decisions').update({ human_outcome: parsed.data.outcome }, COUNT_EXACT).eq('id', parsed.data.decision_id);
  const outcome = judgeWrite({ error: res.error, count: res.count }, 'The outcome');
  if (!outcome.ok) return NextResponse.json({ error: outcome.message }, { status: res.error ? 500 : 404 });
  return NextResponse.json({ ok: true });
}
