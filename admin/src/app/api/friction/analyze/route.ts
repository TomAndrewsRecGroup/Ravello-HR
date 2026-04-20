// POST /api/friction/analyze
// Body: { jd_text, title?, company? }
// Returns: FrictionScore (admin wants ivylens_role_id surfaced for persistence).
// Server-side proxy so IVYLENS_API_KEY never ships to the browser.

import { NextRequest, NextResponse } from 'next/server';
import { scoreFriction } from '@/lib/frictionLens';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single();
    const callerRole = (profile as any)?.role ?? '';
    if (!['tps_admin', 'tps_client'].includes(callerRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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
