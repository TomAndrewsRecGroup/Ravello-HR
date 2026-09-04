// Act on one referral application: advance its status, or approve a
// queued candidate (which sends the invitation).
//
// The email path goes through the same sendReferralInvite() the cron
// uses, so suppression of duplicates, the email_log row and the
// "only mark sent when it actually sent" rule are identical here.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '@/lib/auth/requireStaff';
import { sendReferralInvite } from '@/lib/referral/pipeline';
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

  const { data: app, error: readErr } = await supabase
    .from('referral_applications')
    .select(`
      id, status, candidate_id, company_id, requisition_id, manatal_candidate_id, status_history,
      candidate:candidates!inner ( id, full_name, email ),
      requisition:requisitions!inner ( id, title )
    `)
    .eq('id', params.id)
    .single();

  if (readErr || !app) {
    return NextResponse.json({ error: 'Referral application not found' }, { status: 404 });
  }

  const one = <T,>(v: T | T[]): T => (Array.isArray(v) ? v[0] : v);
  const candidate   = one((app as any).candidate);
  const requisition = one((app as any).requisition);

  // referral_role_config has NO foreign key to referral_applications —
  // both tables independently reference requisitions, which is not the
  // same thing. PostgREST can only embed a table across a real FK
  // edge, so `config:referral_role_config!inner(...)` chained onto the
  // select above (the original shape here) could never resolve: every
  // single call failed with PGRST200 ("no relationship … in the schema
  // cache"), readErr was always truthy, and the route reported "not
  // found" for every approve/reject click regardless of whether the
  // row existed. See CLAUDE.md, 2026-09-04.
  //
  // Fetched as its own query instead — the same pattern runScan.ts
  // already uses to read this table.
  const { data: config, error: configErr } = await supabase
    .from('referral_role_config')
    .select(`
      requisition_id, enabled, dry_run, partner_name, referral_url, email_process_note,
      auto_send_threshold, review_threshold, blocked_countries, mandatory_criteria
    `)
    .eq('requisition_id', app.requisition_id)
    .single();

  if (configErr || !config) {
    return NextResponse.json({ error: 'This role has no referral configuration saved.' }, { status: 404 });
  }

  const now     = new Date().toISOString();
  const history = Array.isArray(app.status_history) ? app.status_history : [];

  /* ─── Approve: send the invitation ─────────────────────── */
  if (body.action === 'approve') {
    if (app.status !== 'review_pending' && app.status !== 'qualified') {
      return NextResponse.json(
        { error: `Only a queued or qualified candidate can be approved (this one is "${app.status}").` },
        { status: 409 },
      );
    }
    if (!candidate?.email) {
      return NextResponse.json({ error: 'No email address on file for this candidate.' }, { status: 422 });
    }

    const sent = await sendReferralInvite({
      supabase,
      toEmail:     candidate.email,
      fullName:    candidate.full_name,
      roleTitle:   requisition.title,
      companyId:   app.company_id,
      candidateId: app.candidate_id,
      // So an approved candidate gets the same per-candidate parameters
      // in their link as one the cron sent automatically.
      manatalCandidateId: (app as any).manatal_candidate_id ?? null,
      requisitionId:      app.requisition_id,
      config,
      sentBy:      auth.userId,
    });

    if (!sent.sent) {
      // Left where it was so it stays visibly outstanding.
      return NextResponse.json({ error: `Email failed: ${sent.error}` }, { status: 502 });
    }

    await supabase.from('referral_applications').update({
      status:            'email_sent',
      email_sent_at:     now,
      email_provider_id: sent.providerId,
      reviewed_by:       auth.userId,
      reviewed_at:       now,
      status_history:    [...history, { at: now, from: app.status, to: 'email_sent', by: auth.userId, reasons: ['Approved from the review queue.'] }],
    }).eq('id', params.id);

    return NextResponse.json({ ok: true, status: 'email_sent' });
  }

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
