import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createRateLimiter, getRateLimitKey } from '@/lib/rateLimit';
import { hashAccessToken, normaliseAccessToken } from '@/lib/auth/accessTokens';
import { parseBody } from '@/lib/validation/parseBody';
import { shortText, optionalShortText, optionalLongText } from '@/lib/validation/primitives';

// Entity QR badge (equipment/COSHH, migration 196) → report an issue
// tied to the scanned object, with no login. Closes a named gap: the
// entity scan page only ever showed a coarse status, never a way to
// flag something wrong with it. Reuses hazards (123) — never a second
// "asset issue" table — linking the asset via linked_asset_id when the
// scanned object is equipment; a COSHH assessment has no FK column on
// hazards to link to, so its name is folded into the hazard's own
// title/description instead, a documented, honest scope limit rather
// than inventing a link column for one entity kind.

const schema = z.object({
  title: shortText(200),
  description: optionalLongText(4000),
  location: optionalShortText(300),
});

const postLimiter = createRateLimiter({ windowMs: 5 * 60_000, max: 10 });

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, props: { params: Promise<{ token: string }> }) {
  if (!postLimiter.check(getRateLimitKey(request)).allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const { token } = await props.params;
  const rawToken = normaliseAccessToken(token);
  if (!rawToken) return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
  const tokenHash = await hashAccessToken(rawToken);

  const service = createServiceSupabaseClient();
  const { data: ctx } = await service.rpc('entity_qr_report_context', { p_token_hash: tokenHash });
  if (!ctx?.ok) return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
  const entityType = ctx.entity_type as 'equipment' | 'coshh_assessment';
  const entityId = ctx.entity_id as string;
  const companyId = ctx.company_id as string;

  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  const { title, description, location } = parsed.data;

  let siteId: string | null = null;
  let linkedAssetId: string | null = null;
  let objectName = '';
  if (entityType === 'equipment') {
    const { data: e } = await service.from('hs_equipment').select('name, site_id').eq('id', entityId).maybeSingle();
    siteId = (e?.site_id as string | null) ?? null;
    objectName = (e?.name as string | undefined) ?? '';
    linkedAssetId = entityId;
  } else {
    const { data: c } = await service.from('coshh_assessments').select('title, site_id').eq('id', entityId).maybeSingle();
    siteId = (c?.site_id as string | null) ?? null;
    objectName = (c?.title as string | undefined) ?? '';
  }

  if (!siteId && !location) {
    return NextResponse.json({ error: 'Please describe where this is.' }, { status: 400 });
  }

  const { data, error } = await service.from('hazards').insert({
    company_id: companyId,
    site_id: siteId,
    linked_location: location,
    linked_asset_id: linkedAssetId,
    title: objectName ? `${title} (${objectName})` : title,
    description,
    source: 'quick_report',
    reported_via: 'qr_scan',
  }).select('id, reference').single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'The report was not saved. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id, reference: data.reference });
}
