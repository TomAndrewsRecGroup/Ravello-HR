import { NextRequest, NextResponse } from 'next/server';
import { scoreFriction } from '@/lib/frictionLens';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// POST /api/friction/analyze
// Body: { jd_text: string }
// Returns: FrictionScore
// Server-side proxy — calls IvyLens via POST /api/partner/roles/analyze pattern
// (scoreFriction already calls IVYLENS_API_URL/api/partner/roles/analyze when API key is set)

export async function POST(req: NextRequest) {
  try {
    // Auth check — only authenticated users may call this route
    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
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
