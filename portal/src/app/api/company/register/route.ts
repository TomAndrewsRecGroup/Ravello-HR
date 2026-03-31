import { NextRequest, NextResponse } from 'next/server';
import { ivylensRequest } from '@/lib/ivylens';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// POST /api/company/register
// Registers company with IvyLens and stores the ivylens_company_id.

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { company_name, industry, country, company_size, employee_count, contact_email } = body;

    if (!company_name || !contact_email) {
      return NextResponse.json({ error: 'company_name and contact_email are required' }, { status: 400 });
    }

    const { data, error } = await ivylensRequest('/company/register', {
      method: 'POST',
      body: { company_name, industry, country, company_size, employee_count, contact_email },
    });

    if (error) {
      return NextResponse.json({ error }, { status: 502 });
    }

    // Store ivylens_company_id on the company record
    const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single();
    if (profile?.company_id && data?.company_id) {
      await supabase
        .from('companies')
        .update({ ivylens_company_id: data.company_id })
        .eq('id', profile.company_id);
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('[/api/company/register]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
