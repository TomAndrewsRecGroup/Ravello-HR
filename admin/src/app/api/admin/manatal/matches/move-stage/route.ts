// POST /api/admin/manatal/matches/move-stage
//
// Move one candidate to a different Manatal pipeline stage, from the
// admin app. The portal equivalent has existed since Phase 31.
//
// Body: { requisition_id, matchId, stageId }
//
// `requisition_id` is required and is NOT decoration. Without it the
// endpoint would move any match id in the whole Manatal account on the
// say-so of a number, so the match is confirmed to belong to this
// requisition's job before anything is written.
//
// No notification is raised. The portal's version tells admins that a
// CLIENT moved somebody; an admin moving a candidate themselves does not
// need to be told they did it, and a notification nobody reads is worse
// than none.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseBody } from '@/lib/validation/parseBody';
import { uuid } from '@/lib/validation/primitives';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { limiters, getUserRateLimitKey, rateLimitResponse } from '@/lib/rateLimit';
import {
  getManatalMatchesForJob,
  isManatalConfigured,
  updateMatchStage,
} from '@/lib/manatal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Manatal ids are positive integers. Bounding them here means the
// handler never has to ask whether `matchId` is a number, and a
// malformed body is a 400 with a field message rather than a 500 from
// inside the ownership check.
const MoveStageSchema = z.object({
  requisition_id: uuid,
  matchId:        z.number().int().positive(),
  stageId:        z.number().int().positive(),
});

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  const rl = limiters.vendor.check(getUserRateLimitKey(req, auth.userId));
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  if (!isManatalConfigured()) {
    return NextResponse.json({ error: 'Manatal is not configured on this environment.' }, { status: 503 });
  }

  const parsed = await parseBody(req, MoveStageSchema);
  if (!parsed.ok) return parsed.response;
  const { requisition_id: requisitionId, matchId, stageId } = parsed.data;

  const supabase = createServerSupabaseClient();
  const { data: row, error } = await supabase
    .from('requisitions')
    .select('id,manatal_job_id')
    .eq('id', requisitionId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row)  return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });

  const jobId = (row as { manatal_job_id: string | null }).manatal_job_id;
  if (!jobId) {
    return NextResponse.json({ error: 'This role is not published to Manatal.' }, { status: 409 });
  }

  // The ownership check. A match id alone names a row anywhere in the
  // account; this confirms it is on THIS role's job before writing.
  const { matches } = await getManatalMatchesForJob(jobId);
  if (!matches.some(m => m.id === matchId)) {
    return NextResponse.json({ error: 'That candidate is not on this role.' }, { status: 403 });
  }

  const updated = await updateMatchStage(matchId, stageId);
  if (!updated) {
    return NextResponse.json({ error: 'Manatal rejected the stage change.' }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
