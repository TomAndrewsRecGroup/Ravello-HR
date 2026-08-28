// POST /api/admin/requisitions/[id]/analyze
//
// Re-runs the IvyLens role analysis on a requisition that already
// exists, and PERSISTS the result — friction score, level, timestamp,
// the composed JD text, and `ivylens_role_id`.
//
// WHY THIS ROUTE EXISTS
//
// `ivylens_role_id` was only ever written by the /hiring/new form, at
// creation, and only if the analyse call happened to succeed. Every
// other route into a requisition — a role created before IvyLens was
// configured, one created while the vendor was down, one imported, one
// raised from the portal — left it null with no way to fill it in.
//
// That is not fatal for the referral pipeline (a scan falls back to
// `jd_text`), but the fallback re-sends the whole JD on every single
// applicant instead of passing a stable id, so the role is re-parsed per
// candidate and the scores drift for reasons that have nothing to do
// with the candidates.
//
// It is deliberately a POST with no body: the JD is composed from the
// stored row via the shared builder, so what gets scored is exactly what
// the requisition says, not what a caller claims it says.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { limiters, getUserRateLimitKey, rateLimitResponse } from '@/lib/rateLimit';
import { scoreFriction } from '@/lib/frictionLens';
import { buildJdText, MIN_JD_TEXT_LENGTH } from '@/lib/jdText';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  // Ceiling on a metered/outbound action, keyed by user rather than IP
  // so one person's bulk re-analyse does not throttle the office.
  const rl = limiters.vendor.check(getUserRateLimitKey(req, auth.userId));
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  // The caller's own client, so RLS decides what they can read and write.
  const supabase = createServerSupabaseClient();

  const { data: row, error: loadErr } = await supabase
    .from('requisitions')
    .select('id,title,department,seniority,location,working_model,salary_min,salary_max,must_haves,description')
    .eq('id', params.id)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!row)    return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });

  const jdText = buildJdText(row as never);

  // A role with a one-line description composes to little more than its
  // own title. Scoring that produces a confident-looking number about
  // nothing, so it is refused with the reason rather than stored.
  if (jdText.trim().length < MIN_JD_TEXT_LENGTH) {
    return NextResponse.json({
      error: 'There is not enough detail on this role to analyse. Add a description or some requirements first.',
    }, { status: 400 });
  }

  let score: Awaited<ReturnType<typeof scoreFriction>>;
  try {
    score = await scoreFriction({ jd_text: jdText, title: row.title });
  } catch (err: any) {
    // scoreFriction throws when IvyLens is unreachable or unconfigured.
    // Nothing is written in that case — a half-written analysis that
    // kept the old role_id and the new score would be worse than none.
    const message: string = err?.message ?? '';
    return NextResponse.json({
      error: message.includes('IvyLens')
        ? message
        : 'Could not analyse this role. Check the IvyLens connection on the Health page and try again.',
    }, { status: 502 });
  }

  const ivylensRoleId = (score as { ivylens_role_id?: string }).ivylens_role_id ?? null;

  const { error: updErr } = await supabase
    .from('requisitions')
    .update({
      friction_score:     score,
      friction_level:     (score as { overall_level?: string }).overall_level ?? null,
      friction_scored_at: new Date().toISOString(),
      // Persisted so the referral scan's fallback has the same text the
      // score was derived from.
      jd_text:            jdText,
      // Only overwrite when IvyLens actually returned one. A local
      // heuristic fallback returns no role_id, and nulling a good id
      // because the vendor was briefly unavailable would silently put
      // the role back on the per-candidate JD path.
      ...(ivylensRoleId ? { ivylens_role_id: ivylensRoleId } : {}),
    })
    .eq('id', params.id);

  if (updErr) {
    return NextResponse.json({
      error: `Analysed, but saving the result failed: ${updErr.message}`,
    }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    friction_score:  score,
    ivylens_role_id: ivylensRoleId,
    /* So the UI can say "scored locally, no role id" rather than
     * implying the role is now wired to IvyLens when it is not. */
    from_ivylens:    Boolean(ivylensRoleId),
  });
}
