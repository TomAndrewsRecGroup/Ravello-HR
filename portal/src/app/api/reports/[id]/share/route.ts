import { NextResponse, type NextRequest } from 'next/server';
import { getSessionProfile } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { isCompanySuperUser } from '@/lib/auth/companyAdmin';
import { parseBody } from '@/lib/validation/parseBody';
import { optionalShortText } from '@/lib/validation/primitives';
import { z } from '@/lib/validation/primitives';
import { mintReportShareToken, listReportShareTokens, revokeReportShareToken, REPORT_SHARE_TOKEN_MAX_TTL_DAYS } from '@/lib/auth/reportShareTokens';

// Shareable report links (go-live gap list, item 7). A client's own
// super user (is_company_super_user() / is_tps_staff(), the Phase 28
// consolidated check) may mint, list and revoke a link for a report in
// their OWN company only — report_share_tokens (207) is service role
// only (RLS on, no policies), so this route is the real authorisation
// boundary, same posture every other service-role-write portal route
// takes (see lib/supabase/service.ts's own header comment).

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, props: Ctx) {
  const session = await getSessionProfile();
  if (!session.companyId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const { id } = await props.params;

  const sb = createServiceSupabaseClient();
  const { data: report } = await sb.from('reports').select('company_id').eq('id', id).maybeSingle();
  if (!report || (report as any).company_id !== session.companyId) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  const links = await listReportShareTokens(sb, id);
  return NextResponse.json({ links });
}

const MintSchema = z.object({
  recipientNote: optionalShortText(200),
  ttlDays: z.number().int().min(1).max(REPORT_SHARE_TOKEN_MAX_TTL_DAYS).optional(),
});

export async function POST(request: NextRequest, props: Ctx) {
  const session = await getSessionProfile();
  if (!session.companyId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!isCompanySuperUser(session)) return NextResponse.json({ error: 'Only an account admin may share a report externally.' }, { status: 403 });
  const { id } = await props.params;

  const parsed = await parseBody(request, MintSchema);
  if (!parsed.ok) return parsed.response;

  const sb = createServiceSupabaseClient();
  const { data: report } = await sb.from('reports').select('company_id').eq('id', id).maybeSingle();
  if (!report || (report as any).company_id !== session.companyId) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  const result = await mintReportShareToken(sb, {
    reportId: id,
    companyId: session.companyId,
    createdBy: session.user.id,
    createdByName: session.profile?.full_name ?? 'A client admin',
    recipientNote: parsed.data.recipientNote,
    ttlDays: parsed.data.ttlDays,
  }, Date.now());

  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 500 });
  const origin = request.nextUrl.origin;
  return NextResponse.json({ url: `${origin}/report/${result.token}`, expiresAt: result.expiresAt });
}

const RevokeSchema = z.object({ tokenHashPrefix: z.string().trim().min(8).max(64) });

export async function DELETE(request: NextRequest, props: Ctx) {
  const session = await getSessionProfile();
  if (!session.companyId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!isCompanySuperUser(session)) return NextResponse.json({ error: 'Only an account admin may revoke a share link.' }, { status: 403 });
  const { id } = await props.params;

  const parsed = await parseBody(request, RevokeSchema);
  if (!parsed.ok) return parsed.response;

  const sb = createServiceSupabaseClient();
  const ok = await revokeReportShareToken(sb, parsed.data.tokenHashPrefix, id, session.companyId);
  if (!ok) return NextResponse.json({ error: 'Link not found or already revoked' }, { status: 404 });
  return NextResponse.json({ success: true });
}
