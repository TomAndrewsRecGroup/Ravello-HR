import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { parseBody } from '@/lib/validation/parseBody';
import { optionalShortText } from '@/lib/validation/primitives';
import { z } from '@/lib/validation/primitives';
import { mintReportShareToken, listReportShareTokens, revokeReportShareToken, REPORT_SHARE_TOKEN_MAX_TTL_DAYS } from '@/lib/auth/reportShareTokens';
import { portalUrl } from '@/lib/portalUrl';

// Shareable report links (go-live gap list, item 7). Staff may mint,
// list and revoke a link for ANY report — the public open page lives
// on the PORTAL (whoever gets the link has no login at all, on either
// app). report_share_tokens (207) is service role only (RLS on, no
// policies), so this route does the authorisation (requireStaff()) and
// the service role does the write.

interface Ctx { params: Promise<{ id: string }> }

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(_request: NextRequest, props: Ctx) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  const { id } = await props.params;

  const sb = adminClient();
  const links = await listReportShareTokens(sb, id);
  return NextResponse.json({ links });
}

const MintSchema = z.object({
  recipientNote: optionalShortText(200),
  ttlDays: z.number().int().min(1).max(REPORT_SHARE_TOKEN_MAX_TTL_DAYS).optional(),
});

export async function POST(request: NextRequest, props: Ctx) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  const { id } = await props.params;

  const parsed = await parseBody(request, MintSchema);
  if (!parsed.ok) return parsed.response;

  const sb = adminClient();
  const { data: report } = await sb.from('reports').select('company_id').eq('id', id).maybeSingle();
  if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });

  // Session client, not the service role, just for the staff member's
  // own name — requireStaff() already proved who they are.
  const session = await createServerSupabaseClient();
  const { data: profile } = await session.from('profiles').select('full_name').eq('id', auth.userId).maybeSingle();

  const result = await mintReportShareToken(sb, {
    reportId: id,
    companyId: (report as any).company_id,
    createdBy: auth.userId,
    createdByName: (profile as any)?.full_name ?? 'A Core OS 360 staff member',
    recipientNote: parsed.data.recipientNote,
    ttlDays: parsed.data.ttlDays,
  }, Date.now());

  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ url: `${portalUrl()}/report/${result.token}`, expiresAt: result.expiresAt });
}

const RevokeSchema = z.object({ tokenHashPrefix: z.string().trim().min(8).max(64) });

export async function DELETE(request: NextRequest, props: Ctx) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  const { id } = await props.params;

  const parsed = await parseBody(request, RevokeSchema);
  if (!parsed.ok) return parsed.response;

  const sb = adminClient();
  const { data: report } = await sb.from('reports').select('company_id').eq('id', id).maybeSingle();
  if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });

  const ok = await revokeReportShareToken(sb, parsed.data.tokenHashPrefix, id, (report as any).company_id);
  if (!ok) return NextResponse.json({ error: 'Link not found or already revoked' }, { status: 404 });
  return NextResponse.json({ success: true });
}
