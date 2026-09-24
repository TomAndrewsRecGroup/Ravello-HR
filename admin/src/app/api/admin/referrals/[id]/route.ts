// Act on one referral application: advance its status, or approve a
// queued candidate (which sends the invitation).
//
// The email path goes through the same sendReferralInvite() the cron
// uses, so suppression of duplicates, the email_log row and the
// "only mark sent when it actually sent" rule are identical here.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '@/lib/auth/requireStaff';
import { sendInviteForApplication } from '@/lib/referral/approve';
import { MANUAL_STATUSES, STATUS_META } from '@/lib/referral/statusMeta';
import type { ReferralStatus } from '@/lib/referral/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service credentials missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  let body: { action?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const supabase = serviceClient();

  /* ─── Approve, or Apply — both send the invitation ─────────
   * 'approve' is the review-queue/qualified-hold flow; 'apply' is the
   * funnel table's override for a rejection. Both go through
   * sendInviteForApplication(), which claims the row before sending and
   * refuses anyone already sent this role's invite. */
  if (body.action === 'approve' || body.action === 'apply') {
    const outcome = await sendInviteForApplication(supabase, params.id, {
      actor: auth.userId,
      mode:  body.action,
    });
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.httpStatus });
    return NextResponse.json({ ok: true, status: outcome.status });
  }

  const { data: app, error: readErr } = await supabase
    .from('referral_applications')
    .select('id, status, status_history')
    .eq('id', params.id)
    .single();

  if (readErr || !app) {
    return NextResponse.json({ error: 'Referral application not found' }, { status: 404 });
  }

  const now     = new Date().toISOString();
  const history = Array.isArray(app.status_history) ? app.status_history : [];

  /* ─── Reject from the queue ────────────────────────────── */
  if (body.action === 'reject') {
    await supabase.from('referral_applications').update({
      status:         'review_rejected',
      reviewed_by:    auth.userId,
      reviewed_at:    now,
      status_history: [...history, { at: now, from: app.status, to: 'review_rejected', by: auth.userId, reasons: ['Rejected from the review queue.'] }],
    }).eq('id', params.id);

    return NextResponse.json({ ok: true, status: 'review_rejected' });
  }

  /* ─── Manual downstream advance ────────────────────────── */
  if (body.status) {
    const next = body.status as ReferralStatus;
    if (!MANUAL_STATUSES.includes(next)) {
      // Only the downstream stages are hand-settable. Letting a human
      // move a row back into a pipeline-owned status would put the
      // email record and the idempotency guard into disagreement about
      // whether the candidate was ever contacted.
      return NextResponse.json(
        { error: `"${next}" is not a manually settable status. Allowed: ${MANUAL_STATUSES.join(', ')}.` },
        { status: 400 },
      );
    }

    await supabase.from('referral_applications').update({
      status:         next,
      status_history: [...history, { at: now, from: app.status, to: next, by: auth.userId, reasons: [`Set to ${STATUS_META[next].label} by hand.`] }],
    }).eq('id', params.id);

    return NextResponse.json({ ok: true, status: next });
  }

  return NextResponse.json({ error: 'Nothing to do — send an action or a status.' }, { status: 400 });
}
