// POST /api/friction/analyze
// Body: { jd_text, title?, company? }
// Returns: FrictionScore (admin wants ivylens_role_id surfaced for persistence).
// Server-side proxy so IVYLENS_API_KEY never ships to the browser.

import { NextRequest, NextResponse } from 'next/server';
import { scoreFriction } from '@/lib/frictionLens';
import { requireStaff } from '@/lib/auth/requireStaff';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireStaff();
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const jd_text: string = (body.jd_text ?? '').trim();
    if (!jd_text || jd_text.length < 20) {
      return NextResponse.json({ error: 'jd_text must be at least 20 characters' }, { status: 400 });
    }

    const score = await scoreFriction({
      jd_text,
      title:   body.title,
      company: body.company,
    });
    return NextResponse.json(score);
  } catch (err: any) {
    console.error('[admin /api/friction/analyze]', err);
    const message = err?.message?.includes('IvyLens')
      ? err.message
      : 'Could not score this role. Please try again or raise a support ticket.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
