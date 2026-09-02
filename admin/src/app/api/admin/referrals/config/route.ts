// Create or update a role's referral configuration.
//
// The existence of a referral_role_config row is what makes a
// requisition a referral role, so this endpoint is the on-switch.

import { NextRequest, NextResponse } from 'next/server';
import { findUnknownTokens, REFERRAL_URL_TOKEN_NAMES } from '@/lib/referral/referralUrl';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '@/lib/auth/requireStaff';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service credentials missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

function cleanStrings(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(x => String(x ?? '').trim()).filter(Boolean);
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const requisitionId = String(body.requisition_id ?? '').trim();
  if (!requisitionId) {
    return NextResponse.json({ error: 'requisition_id is required' }, { status: 400 });
  }

  const partnerName = String(body.partner_name ?? '').trim();
  const referralUrl = String(body.referral_url ?? '').trim();
  const enabled     = Boolean(body.enabled);
  const dryRun      = body.dry_run === undefined ? true : Boolean(body.dry_run);

  // Both default to 75: the operator's rule is "anyone over 75% gets the
  // email" (2026-08-28). With the previous 85/75 defaults a role left
  // untouched parked every 75-84% candidate in the review queue instead
  // of emailing them — the right people, silently held back, which is
  // the hardest kind of wrong to notice.
  const autoSend = Number(body.auto_send_threshold ?? 75);
  const review   = Number(body.review_threshold ?? 75);
  const countries = cleanStrings(body.blocked_countries);

  const criteria = Array.isArray(body.mandatory_criteria)
    ? body.mandatory_criteria
        .map((c: any) => ({
          key:         String(c?.key ?? '').trim(),
          label:       String(c?.label ?? '').trim(),
          match_terms: cleanStrings(c?.match_terms),
        }))
        .filter((c: any) => c.key && c.label)
    : [];

  /* ─── Validation ───────────────────────────────────────── */

  if (!partnerName) return NextResponse.json({ error: 'A partner name is required — it appears in the candidate email.' }, { status: 400 });
  if (!referralUrl) return NextResponse.json({ error: 'A referral URL is required.' }, { status: 400 });
  // Placeholders are stripped before parsing: `{email}` is not valid in
  // a URL, so a template carrying one would fail this check even though
  // the link it produces at send time is fine.
  try {
    const u = new URL(referralUrl.replace(/\{[A-Za-z0-9_]+\}/g, 'x'));
    if (u.protocol !== 'https:') throw new Error();
  } catch {
    return NextResponse.json({ error: 'The referral URL must be a valid https:// address.' }, { status: 400 });
  }

  // An unknown token would ship LITERALLY — every candidate arriving at
  // the partner with "?name=%7Bfirstname%7D" — and nobody would notice
  // until a fee reconciliation failed weeks later. Refused here, at the
  // one moment somebody is looking at the field.
  const unknownTokens = findUnknownTokens(referralUrl);
  if (unknownTokens.length > 0) {
    return NextResponse.json({
      error: `Unknown parameter${unknownTokens.length > 1 ? 's' : ''} in the referral URL: ${unknownTokens.map(t => `{${t}}`).join(', ')}. Available: ${REFERRAL_URL_TOKEN_NAMES.map(t => `{${t}}`).join(', ')}.`,
    }, { status: 400 });
  }

  if (![autoSend, review].every(n => Number.isInteger(n) && n >= 0 && n <= 100)) {
    return NextResponse.json({ error: 'Thresholds must be whole numbers between 0 and 100.' }, { status: 400 });
  }
  if (review > autoSend) {
    return NextResponse.json({ error: 'The review threshold cannot be higher than the auto-send threshold.' }, { status: 400 });
  }

  // NO empty-list check. Before migration 084 this was an ALLOW list,
  // so an empty one refused every applicant and refusing to ENABLE in
  // that state turned a silent run of rejections into a message at the
  // point the mistake was made. An empty BLOCK list means "refuse
  // nobody" — a legitimate configuration, and the most likely starting
  // one — so the same check would now block a correct setup.

  const badCriterion = criteria.find((c: any) => !c.match_terms.length);
  if (badCriterion) {
    return NextResponse.json(
      { error: `Mandatory criterion "${badCriterion.label}" has no match terms, so it could never be evidenced and would fail everyone.` },
      { status: 400 },
    );
  }

  const supabase = serviceClient();

  const { data: req_, error: reqErr } = await supabase
    .from('requisitions')
    .select('id, manatal_job_id')
    .eq('id', requisitionId)
    .single();

  if (reqErr || !req_) {
    return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
  }
  if (enabled && !req_.manatal_job_id) {
    return NextResponse.json(
      { error: 'This role has not been published to Manatal yet, so no applicants can reach it. Publish it first.' },
      { status: 409 },
    );
  }

  const { error } = await supabase.from('referral_role_config').upsert({
    requisition_id:      requisitionId,
    enabled,
    dry_run:             dryRun,
    partner_name:        partnerName,
    referral_url:        referralUrl,
    email_process_note:  String(body.email_process_note ?? '').trim() || null,
    auto_send_threshold: autoSend,
    review_threshold:    review,
    blocked_countries:   countries,
    mandatory_criteria:  criteria,
  }, { onConflict: 'requisition_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  const requisitionId = req.nextUrl.searchParams.get('requisition_id');
  if (!requisitionId) return NextResponse.json({ error: 'requisition_id is required' }, { status: 400 });

  const supabase = serviceClient();
  const { error } = await supabase.from('referral_role_config').delete().eq('requisition_id', requisitionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
