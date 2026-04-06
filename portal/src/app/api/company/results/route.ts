import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ivylensRequest } from '@/lib/ivylens';

// GET /api/company/results
// Returns the latest company assessment. Tries IvyLens first (if company has
// an ivylens_company_id), falls back to local DB.

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id, companies(ivylens_company_id)')
      .eq('id', user.id)
      .single();

    if (!profile?.company_id) {
      return NextResponse.json({ error: 'No company' }, { status: 400 });
    }

    const ivylensCompanyId = (profile as any)?.companies?.ivylens_company_id;

    // Try IvyLens first if company is registered
    if (ivylensCompanyId) {
      const params = new URLSearchParams({ company_id: ivylensCompanyId });
      const { data: ivylensData } = await ivylensRequest(
        `/company/results?${params.toString()}`
      );
      if (ivylensData?.assessment) {
        return NextResponse.json({ assessment: ivylensData.assessment });
      }
    }

    // Fallback to local DB
    const { data: assessment } = await supabase
      .from('company_assessments')
      .select('*')
      .eq('company_id', profile.company_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({ assessment: assessment ?? null });
  } catch (err) {
    console.error('[/api/company/results]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
