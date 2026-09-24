// POST /api/admin/referrals/send-qualified
//
// Sends the invite to every `qualified` application — the rows a role
// held back while dry run was on. `processRole` never reconsiders a row
// it already holds, so turning dry run off does not send these; until
// now the only way was one "Send invite" click per row.
//
// Each row goes through sendInviteForApplication(), the same path as
// the single button: already-sent addresses are refused, the row is
// claimed before the send, and a failed send leaves it `qualified`.
// Rows run one at a time (the claim is what makes a double-submitted
// batch unable to send anyone twice), and the batch stops after three consecutive send
// failures — that is Resend refusing (usually the daily quota), and
// carrying on would only burn through the rest as failures.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '@/lib/auth/requireStaff';
import { limiters, getUserRateLimitKey, rateLimitResponse } from '@/lib/rateLimit';
import { parseBody } from '@/lib/validation/parseBody';
import { optionalUuid, z } from '@/lib/validation/primitives';
import { sendInviteForApplication } from '@/lib/referral/approve';

export const runtime     = 'nodejs';
export const dynamic     = 'force-dynamic';
export const maxDuration = 120;

/** One batch. Far below the 1,000-row read cap, and at ~1s a send it
 *  finishes well inside maxDuration. Anything left is a second click. */
const SEND_QUALIFIED_BATCH = 50;
const MAX_CONSECUTIVE_FAILURES = 3;

const Schema = z.object({
  requisition_id: optionalUuid,
});

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service credentials missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  const rl = limiters.email.check(getUserRateLimitKey(req, auth.userId));
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  const parsed = await parseBody(req, Schema);
  if (!parsed.ok) return parsed.response;

  const supabase = serviceClient();

  let query = supabase
    .from('referral_applications')
    .select('id')
    .eq('status', 'qualified')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(SEND_QUALIFIED_BATCH);
  if (parsed.data.requisition_id) query = query.eq('requisition_id', parsed.data.requisition_id);

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: `Could not read qualified applications: ${error.message}` }, { status: 500 });

  const sent: string[] = [];
  const skipped: { id: string; reason: string }[] = [];
  const failed:  { id: string; reason: string }[] = [];
  let consecutiveFailures = 0;
  let stoppedEarly = false;

  for (const { id } of rows ?? []) {
    const outcome = await sendInviteForApplication(supabase, id, { actor: auth.userId, mode: 'approve' });
    if (outcome.ok) {
      sent.push(id);
      consecutiveFailures = 0;
    } else if (outcome.httpStatus === 502) {
      failed.push({ id, reason: outcome.error });
      if (++consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) { stoppedEarly = true; break; }
    } else {
      // Refused on purpose (already emailed, no address, changed since
      // read) — not a delivery fault, so it does not count toward the stop.
      skipped.push({ id, reason: outcome.error });
    }
  }

  return NextResponse.json({
    ok: true,
    considered: rows?.length ?? 0,
    sent: sent.length,
    skipped,
    failed,
    stopped_early: stoppedEarly,
    more_remaining: (rows?.length ?? 0) === SEND_QUALIFIED_BATCH,
  });
}
