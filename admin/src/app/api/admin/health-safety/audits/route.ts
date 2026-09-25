import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { parseBody } from '@/lib/validation/parseBody';
import { z, uuid, optionalUuid, shortText, optionalLongText, isoDate, enumOf } from '@/lib/validation/primitives';
import { HS_AUDIT_RATINGS, HS_REGISTER_CATEGORIES } from '@/lib/hs/vocab';
import { computeAuditScore } from '@/lib/hs/auditScore';

// POST /api/admin/health-safety/audits — the ONE call the offline-
// capable audit runner makes, once, when the auditor hits Submit.
// Everything before that (working through the checklist, possibly with
// no signal at all) happens entirely in the browser's own storage; nothing
// server-side exists until this call succeeds.
//
// `id` is CLIENT-GENERATED (crypto.randomUUID() when the audit starts),
// so a retry after a dropped connection — the runner does not know
// whether the first attempt actually landed — is safe: hs_submit_audit()
// returns the existing audit unchanged rather than creating a second one
// and re-raising its findings and notifications a second time.
//
// Score is computed HERE, from the validated responses, never trusted
// from the client — the same computeAuditScore() the runner also uses
// to show a live preview, so the two can never disagree.

export const runtime = 'nodejs';

const ResponseInput = z.object({
  // Client-generated (113), the same reason the audit's own id is:
  // it lets the runner stage a photo against a specific answer while
  // still offline, before that answer's row exists anywhere, and
  // upload it under the right entity_id the moment Submit succeeds.
  // Optional so an old draft saved before this shipped still submits —
  // hs_submit_audit() falls back to generating one itself.
  id:                optionalUuid,
  template_item_id: optionalUuid,
  prompt:            shortText(500),
  category:          enumOf(HS_REGISTER_CATEGORIES).optional().nullable(),
  rating:            enumOf(HS_AUDIT_RATINGS),
  comment:           optionalLongText(2000),
});

const Body = z.object({
  id:           uuid,
  company_id:   uuid,
  site_id:      optionalUuid,
  template_id:  optionalUuid,
  title:        shortText(200),
  conducted_on: isoDate,
  notes:        optionalLongText(4000),
  responses:    z.array(ResponseInput).min(1).max(200),
});

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, Body);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const score = computeAuditScore(body.responses);
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.rpc('hs_submit_audit', {
    p_id: body.id,
    p_company_id: body.company_id,
    p_site_id: body.site_id,
    p_template_id: body.template_id,
    p_title: body.title,
    p_conducted_on: body.conducted_on,
    p_notes: body.notes,
    p_score: score,
    p_responses: body.responses.map((r, i) => ({
      id: r.id ?? '',
      template_item_id: r.template_item_id ?? '',
      prompt: r.prompt,
      category: r.category ?? '',
      rating: r.rating,
      comment: r.comment ?? '',
      sort_order: i,
    })),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, id: data as string, score });
}
