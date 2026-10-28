import { NextResponse, type NextRequest } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createRateLimiter, getRateLimitKey } from '@/lib/rateLimit';
import { parseBody } from '@/lib/validation/parseBody';
import { z } from '@/lib/validation/primitives';
import { loadMatchContext, publicMatchView, submitMatch } from '@/lib/a2iRoles/match';

// Public, token-authenticated "Match me" (no login: the athlete has
// none). GET shows the role; only the POST records the request and
// emails Tom — see lib/a2iRoles/match.ts on why a GET never acts.
// Under /api/r/, which the portal middleware already treats as public.

const ipGetLimiter  = createRateLimiter({ windowMs: 5 * 60_000, max: 60 });
const ipPostLimiter = createRateLimiter({ windowMs: 5 * 60_000, max: 20 });

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ token: string; jobId: string }> }

const Body = z.object({
  note: z.string().trim().max(1000).optional().nullable().transform(v => v || null),
});

export async function GET(request: NextRequest, props: Ctx) {
  const { token, jobId } = await props.params;
  if (!ipGetLimiter.check(getRateLimitKey(request)).allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  const ctx = await loadMatchContext(createServiceSupabaseClient(), token, jobId);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  return NextResponse.json(publicMatchView(ctx));
}

export async function POST(request: NextRequest, props: Ctx) {
  const { token, jobId } = await props.params;
  if (!ipPostLimiter.check(getRateLimitKey(request)).allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  const parsed = await parseBody(request, Body);
  if (!parsed.ok) return parsed.response;

  const sb = createServiceSupabaseClient();
  const ctx = await loadMatchContext(sb, token, jobId);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const result = await submitMatch(sb, ctx, parsed.data.note);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true, already: result.already });
}
