import { NextRequest, NextResponse } from 'next/server';
import { parseBody } from '@/lib/validation/parseBody';
import { optionalEmail, optionalShortText, shortText, smallCount, z } from '@/lib/validation/primitives';
import { ivylensRequest } from '@/lib/ivylens';
import { requireLiveSession } from '@/lib/auth/liveSession';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

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
    // Live check: the company write below uses the service role.
    const live = await requireLiveSession();
    if (!live) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const companyId = live.companyId;

    const parsed = await parseBody(req, RegisterSchema);
    if (!parsed.ok) return parsed.response;
    const { company_name, industry, country, company_size, employee_count, contact_email } = parsed.data;

    if (!company_name || !contact_email) {
      return NextResponse.json({ error: 'company_name and contact_email are required' }, { status: 400 });
    }

    // Already registered: hand back the stored id rather than creating a
    // second IvyLens company and orphaning the first one's assessments.
    if (companyId) {
      const { data: existing } = await createServiceSupabaseClient()
        .from('companies').select('ivylens_company_id').eq('id', companyId).maybeSingle();
      if (existing?.ivylens_company_id) {
        return NextResponse.json({ company_id: existing.ivylens_company_id, already_registered: true });
      }
    }

    const { data, error } = await ivylensRequest('/company/register', {
      method: 'POST',
      body: { company_name, industry, country, company_size, employee_count, contact_email },
    });

    if (error) {
      return NextResponse.json({ error }, { status: 502 });
    }

    // Store ivylens_company_id on the company record. Service role: since
    // 088 a client cannot write this column themselves — it keys server-
    // side IvyLens reads, so a client who could set it could read another
    // company's results. The company comes from the session, never the body.
    if (companyId && data?.company_id) {
      const { error: saveErr, count: saved } = await createServiceSupabaseClient()
        .from('companies')
        .update({ ivylens_company_id: data.company_id }, { count: 'exact' })
        .eq('id', companyId);
      if (saveErr || !saved) {
        console.error('[/api/company/register] could not store ivylens_company_id:', saveErr);
        return NextResponse.json({ error: 'Registered with IvyLens but could not save the link. Please try again.' }, { status: 500 });
      }
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('[/api/company/register]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
