import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// GET /api/company/results
// Returns the latest company assessment from local DB.

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single();
    if (!profile?.company_id) {
      return NextResponse.json({ error: 'No company' }, { status: 400 });
    }

    const { data: assessment } = await supabase
      .from('company_assessments')
      .select('*')
      .eq('company_id', profile.company_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!assessment) {
      return NextResponse.json({ assessment: null });
    }

    return NextResponse.json({ assessment });
  } catch (err) {
    console.error('[/api/company/results]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
