// POST /api/admin/requisitions/[id]/scan-candidate
//
// Score ONE candidate against ONE role, by hand, from the admin app.
//
// The referral pipeline only ever scans what Manatal's job boards send
// it. Everything else an operator holds — a CV that arrived by email, a
// name from a referral, somebody sourced directly — could be added as a
// candidate but never scored, so the Friction Lens role analysis had no
// use outside the automated funnel.
//
// This reuses the pipeline's scorer verbatim (`runCandidateScan` +
// `toPercent`) rather than re-implementing it. Two scores that mean
// different things because they were computed by different code is the
// drift this codebase keeps paying for, and here it would be invisible:
// both are integers between 0 and 100.
//
// It does NOT touch Manatal. Manatal is read-only in this system, and a
// candidate the operator typed in did not come from a job board.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseBody } from '@/lib/validation/parseBody';
import { optionalEmail, longText, shortText, optionalLongText } from '@/lib/validation/primitives';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { limiters, getUserRateLimitKey, rateLimitResponse } from '@/lib/rateLimit';
import { runCandidateScan } from '@/lib/referral/ivylensScan';
import { toPercent } from '@/lib/referral/gate';
import { buildJdText } from '@/lib/jdText';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// `cv_text` is bounded at 20k, which is a long CV and well under what
// the scan endpoint will accept. An unbounded field here is a way to
// spend somebody else's AI budget.
const ScanCandidateSchema = z.object({
  full_name:       shortText(200),
  email:           optionalEmail,
  cv_text:         longText(20_000),
  recruiter_notes: optionalLongText(2_000),
  /** Store the candidate against the role, or score and discard.
   *  Defaults to storing — an operator who scored somebody usually
   *  wants them on the pipeline. */
  save:            z.boolean().optional().default(true),
});

export async function POST(httpReq: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  // Metered: every call spends IvyLens credit.
  const rl = limiters.vendor.check(getUserRateLimitKey(httpReq, auth.userId));
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const parsed = await parseBody(httpReq, ScanCandidateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const supabase = createServerSupabaseClient();
  const { data: req, error: loadErr } = await supabase
    .from('requisitions')
    .select('id,company_id,title,department,seniority,location,working_model,salary_min,salary_max,must_haves,description,jd_text,ivylens_role_id')
    .eq('id', params.id)
    .single();
  if (loadErr || !req) {
    return NextResponse.json({ error: loadErr?.message ?? 'Requisition not found' }, { status: 404 });
  }

  const r = req as Record<string, any>;

  // Prefer the stable role id. Falling back to JD text keeps this
  // usable on a role that was never analysed — but the score is then
  // computed against text rather than the stored role, so the caller
  // is TOLD which happened rather than left to assume.
  const roleId   = r.ivylens_role_id ?? null;
  const roleText = roleId
    ? null
    : (r.jd_text || buildJdText({
        title:         r.title,
        department:    r.department,
        seniority:     r.seniority,
        location:      r.location,
        working_model: r.working_model,
        salary_min:    r.salary_min,
        salary_max:    r.salary_max,
        must_haves:    r.must_haves ?? [],
        description:   r.description,
      }));

  const outcome = await runCandidateScan({
    candidateText: body.cv_text,
    roleId,
    roleText,
  });

  if (!outcome.scan) {
    // Surfaced verbatim. A scan that failed must never look like a
    // candidate who scored badly — that is the whole reason the scorer
    // refuses empty input rather than returning zero.
    return NextResponse.json(
      { error: outcome.error ?? 'IvyLens returned no score.' },
      { status: outcome.status >= 400 ? outcome.status : 502 },
    );
  }

  const score = toPercent(outcome.scan.overall_score);
  const notes = buildScreeningNotes(outcome.scan);

  if (!body.save) {
    return NextResponse.json({
      ok: true, saved: false, score, notes,
      scanned_against: roleId ? 'role_id' : 'jd_text',
      scan: outcome.scan,
    });
  }

  const { data: candidate, error: insErr } = await supabase
    .from('candidates')
    .insert({
      requisition_id:  req.id,
      company_id:      r.company_id,
      full_name:       body.full_name,
      email:           body.email,
      recruiter_notes: body.recruiter_notes,
      screening_score: score,
      screening_notes: notes,
      screened_at:     new Date().toISOString(),
      screened_by:     auth.userId,
      source:          'manual_scan',
      // NOT shared with the client. Scoring somebody is an internal
      // step; surfacing them is a separate, deliberate action.
      approved_for_client: false,
    })
    .select('id,full_name,email,screening_score,screening_notes,screened_at,source')
    .single();

  if (insErr) {
    // The scan succeeded and cost credit, so the score is returned even
    // though the row was not written. Losing it would mean paying for
    // the same scan twice.
    return NextResponse.json(
      { error: `Scored ${score}% but saving the candidate failed: ${insErr.message}`, score, notes },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true, saved: true, score, notes,
    scanned_against: roleId ? 'role_id' : 'jd_text',
    candidate,
  });
}

/** A readable record of WHY the score is what it is.
 *
 *  Stored rather than recomputed: the scan is not free to repeat, and a
 *  bare number months later is not reviewable. */
function buildScreeningNotes(scan: {
  strengths?: string[];
  gaps?: string[];
  experience_analysis?: string;
}): string {
  const parts: string[] = [];
  if (scan.experience_analysis) parts.push(scan.experience_analysis.trim());
  const list = (heading: string, items?: string[]) => {
    const clean = (items ?? []).map(s => (s ?? '').trim()).filter(Boolean);
    if (clean.length) parts.push(`${heading}:\n${clean.map(s => `- ${s}`).join('\n')}`);
  };
  list('Strengths', scan.strengths);
  list('Gaps', scan.gaps);
  return parts.join('\n\n').slice(0, 8_000);
}
