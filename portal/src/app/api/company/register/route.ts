import { NextRequest, NextResponse } from 'next/server';
import { parseBody } from '@/lib/validation/parseBody';
import { optionalEmail, optionalShortText, shortText, smallCount, z } from '@/lib/validation/primitives';
import { ivylensRequest } from '@/lib/ivylens';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';

// POST /api/company/register
// Registers company with IvyLens and stores the ivylens_company_id.


const RegisterSchema = z.object({
  company_name:   shortText(200),
  industry:       optionalShortText(120),
  country:        optionalShortText(80),
  company_size:   optionalShortText(40),
  employee_count: smallCount.optional().nullable(),
  contact_email:  optionalEmail,
});

export async function POST(req: NextRequest) {
  try {
    const { user, companyId } = await getSessionProfile();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const parsed = await parseBody(req, RegisterSchema);
    if (!parsed.ok) return parsed.response;
    const { company_name, industry, country, company_size, employee_count, contact_email } = parsed.data;

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
    if (companyId && data?.company_id) {
      const supabase = createServerSupabaseClient();
      await supabase
        .from('companies')
        .update({ ivylens_company_id: data.company_id })
        .eq('id', companyId);
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('[/api/company/register]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
