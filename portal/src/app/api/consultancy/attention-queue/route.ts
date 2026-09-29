import { NextResponse } from 'next/server';
import { requirePortfolioSession } from '@/lib/consultancy/portfolioAccess';
import { loadAttentionQueue } from '@/lib/consultancy/loadAttentionQueue';

// Phase 6 section 3: a single consultant queue across every authorised
// client. RLS cannot answer a cross-client question (167's own header
// comment) — loadAttentionQueue() derives the org id list from the
// caller's OWN valid grants and scopes every bulk read to exactly that
// list with the service role, never wider. Shared with the page itself
// so the two can never disagree about what the queue contains.
export const dynamic = 'force-dynamic';

export async function GET() {
  const portfolio = await requirePortfolioSession();
  if (!portfolio) return NextResponse.json({ items: [] }, { status: 200 });
  const items = await loadAttentionQueue(portfolio);
  return NextResponse.json({ items });
}
