import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { parseBody } from '@/lib/validation/parseBody';
import { z } from '@/lib/validation/primitives';
import { serviceClient } from '@/lib/automation/runs';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';

// POST /api/admin/automation/retry — put a failed event back in the
// queue. Sessions cannot write platform_events (096), so this uses the
// service role behind requireStaff(); it changes only the retry
// bookkeeping, never the event itself.

export const runtime = 'nodejs';

const Body = z.object({ event_id: z.number().int().positive() });

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  const parsed = await parseBody(req, Body);
  if (!parsed.ok) return parsed.response;

  const sb = serviceClient();
  const res = await sb.from('platform_events')
    .update({ attempts: 0, claimed_at: null, last_error: null }, COUNT_EXACT)
    .eq('id', parsed.data.event_id).is('processed_at', null);
  const outcome = judgeWrite({ error: res.error, count: res.count }, 'The retry');
  if (!outcome.ok) return NextResponse.json({ error: outcome.message }, { status: res.error ? 500 : 404 });
  return NextResponse.json({ ok: true });
}
