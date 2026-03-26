import { NextRequest, NextResponse } from 'next/server';
import { scoreFriction } from '@/lib/frictionLens';

// POST /api/friction/analyze
// Body: { jd_text: string }
// Returns: FrictionScore
// Server-side proxy — IVYLENS_API_URL stays out of the browser.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const jd_text: string = (body.jd_text ?? '').trim();

    if (!jd_text || jd_text.length < 20) {
      return NextResponse.json(
        { error: 'jd_text must be at least 20 characters' },
        { status: 400 },
      );
    }

    const score = await scoreFriction({ jd_text });
    return NextResponse.json(score);
  } catch (err) {
    console.error('[/api/friction/analyze]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
