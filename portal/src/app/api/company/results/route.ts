import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ivylensRequest } from '@/lib/ivylens';
import { effectiveCompanyId } from '@/lib/auth/activeOrganisation';

// Force dynamic — this route reads cookies via supabase.auth.getUser(),
// so it can never be statically prerendered. Without this, Next 14
// emits a build warning and may attempt a static render at deploy time.
export const dynamic = 'force-dynamic';

// GET /api/company/results
// Returns the latest company assessment. Tries IvyLens first (if company has
// an ivylens_company_id), falls back to local DB.

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // The ACTIVE organisation (a consultant may be working in a client),
    // not profiles.company_id — see lib/auth/activeOrganisation.ts.
    const companyId = await effectiveCompanyId(supabase);
    if (!companyId) {
      return NextResponse.json({ error: 'No company' }, { status: 400 });
    }
    const { data: company } = await supabase
      .from('companies').select('ivylens_company_id').eq('id', companyId).single();

    const ivylensCompanyId = (company as any)?.ivylens_company_id;

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
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({ assessment: assessment ?? null });
  } catch (err) {
    console.error('[/api/company/results]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
