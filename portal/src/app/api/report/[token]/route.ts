import { NextResponse, type NextRequest } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createRateLimiter, getRateLimitKey } from '@/lib/rateLimit';
import { peekReportShareToken, touchReportShareToken } from '@/lib/auth/reportShareTokens';
import { signFileUrl } from '@/lib/storage/files';

// Public, token-authenticated report viewing (go-live gap list, item
// 7). The recipient — an insurer, an auditor, a regulator — has no
// portal login at all. Same security model as /api/policy/[token]:
// every read goes through the service-role client, the token (a
// 122-bit UUID whose SHA-256 is in report_share_tokens, 207) IS the
// authorisation, and the payload is the minimum the page needs.

const ipGetLimiter = createRateLimiter({ windowMs: 5 * 60_000, max: 30 });

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ token: string }> }

export async function GET(request: NextRequest, props: Ctx) {
  const params = await props.params;
  if (!ipGetLimiter.check(getRateLimitKey(request)).allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const sb = createServiceSupabaseClient();
  const peek = await peekReportShareToken(sb, params.token);
  if (peek === null) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
  if (peek === 'revoked') return NextResponse.json({ error: 'This link has been revoked.' }, { status: 410 });
  if (peek === 'expired') return NextResponse.json({ error: 'This link has expired.' }, { status: 410 });

  const [{ data: report }, { data: company }] = await Promise.all([
    sb.from('reports').select('title, period, storage_path, file_url, narrative').eq('id', peek.reportId).maybeSingle(),
    sb.from('companies').select('name').eq('id', peek.companyId).maybeSingle(),
  ]);
  const reportRow = report as { title: string; period: string | null; storage_path: string | null; file_url: string | null; narrative: string | null } | null;
  if (!reportRow) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });

  const url = reportRow.storage_path ? await signFileUrl(sb, 'documents', reportRow.storage_path) : (reportRow.file_url || null);

  // Best-effort — never blocks the response a legitimate recipient is
  // waiting on.
  touchReportShareToken(sb, peek.tokenHash).catch(() => {});

  return NextResponse.json({
    company: { name: (company as { name: string } | null)?.name ?? '' },
    report: { title: reportRow.title, period: reportRow.period, narrative: reportRow.narrative, url },
    recipientNote: peek.recipientNote,
  });
}
