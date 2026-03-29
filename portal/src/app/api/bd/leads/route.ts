import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// GET /api/bd/leads
// Looks up the company's active bd_pipeline partner key,
// then proxies GET /api/partner/bd/leads on IvyLens with it.
// Returns 404 if no key is configured.

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    if (!profile?.company_id) {
      return NextResponse.json({ error: 'No company' }, { status: 400 });
    }

    // Find the most recent active bd_pipeline key for this company
    const { data: keyRow } = await supabase
      .from('partner_api_keys')
      .select('id, key_value')
      .eq('company_id', profile.company_id)
      .is('revoked_at', null)
      .contains('permissions', ['bd_pipeline'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!keyRow) {
      return NextResponse.json({ error: 'No bd_pipeline API key configured' }, { status: 404 });
    }

    const apiUrl = process.env.IVYLENS_API_URL ?? '';
    if (!apiUrl) {
      return NextResponse.json({ error: 'IVYLENS_API_URL not configured' }, { status: 503 });
    }

    // Call IvyLens with the company's own ivl_ key
    const res = await fetch(`${apiUrl}/api/partner/bd/leads`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${keyRow.key_value}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json(
        { error: text || `IvyLens returned ${res.status}` },
        { status: res.status },
      );
    }

    const data = await res.json();

    // Track last usage
    await supabase
      .from('partner_api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyRow.id);

    return NextResponse.json(data);
  } catch (err) {
    console.error('[/api/bd/leads]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
