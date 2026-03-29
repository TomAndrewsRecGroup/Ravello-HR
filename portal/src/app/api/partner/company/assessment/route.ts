import { NextRequest, NextResponse } from 'next/server';
import { authenticatePartnerKey } from '@/lib/partnerAuth';
import { ivylensRequest } from '@/lib/ivylens';

// POST /api/partner/company/assessment
// Auth: Bearer ivl_... with company_assessment permission
// Body: { company_id?, form_responses, employee_count? }
// Proxies to IvyLens /api/partner/company/assessment and returns the result.

export async function POST(req: NextRequest) {
  const auth = await authenticatePartnerKey(
    req.headers.get('authorization'),
    'company_assessment',
  );
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error }, { status: auth.status ?? 401 });
  }

  try {
    const body = await req.json();
    const { company_id, form_responses, employee_count } = body;

    if (!form_responses) {
      return NextResponse.json({ error: 'form_responses required' }, { status: 400 });
    }

    // Proxy to IvyLens
    const { data: result, error: apiError } = await ivylensRequest('/company/assessment', {
      method: 'POST',
      body: { company_id, form_responses },
      timeout: 30_000,
    });

    if (apiError) {
      return NextResponse.json({ error: `IvyLens error: ${apiError}` }, { status: 502 });
    }

    return NextResponse.json({ result });
  } catch (err) {
    console.error('[/api/partner/company/assessment]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
