import { NextRequest, NextResponse } from 'next/server';
import { authenticatePartnerKey } from '@/lib/partnerAuth';
import { ivylensRequest } from '@/lib/ivylens';
import { scoreFriction } from '@/lib/frictionLens';

// POST /api/partner/roles/analyze
// Auth: Bearer ivl_... with role_analyze permission
// Body: { jd_text: string }
// Proxies to IvyLens /api/partner/roles/analyze, falls back to local heuristic.

export async function POST(req: NextRequest) {
  const auth = await authenticatePartnerKey(
    req.headers.get('authorization'),
    'role_analyze',
  );
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error }, { status: auth.status ?? 401 });
  }

  try {
    const body = await req.json();
    const jd_text: string = (body.jd_text ?? '').trim();

    if (!jd_text || jd_text.length < 20) {
      return NextResponse.json(
        { error: 'jd_text must be at least 20 characters' },
        { status: 400 },
      );
    }

    // Use the existing scoreFriction which already calls IvyLens or falls back to local
    const score = await scoreFriction({ jd_text });
    return NextResponse.json(score);
  } catch (err) {
    console.error('[/api/partner/roles/analyze]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
