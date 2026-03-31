import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ivylensRequest } from '@/lib/ivylens';

// GET /api/bd/leads
// Proxies GET /api/partner/bd/leads on IvyLens using the centralized API key.

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error, status } = await ivylensRequest('/bd/leads');

    if (error) {
      return NextResponse.json({ error }, { status: status || 502 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('[/api/bd/leads]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
