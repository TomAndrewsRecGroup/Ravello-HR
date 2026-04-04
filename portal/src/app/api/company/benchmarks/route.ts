import { NextRequest, NextResponse } from 'next/server';
import { ivylensRequest } from '@/lib/ivylens';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// GET /api/company/benchmarks?industry=Technology&country=UK
// Proxy to IvyLens benchmarks endpoint.

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const industry = searchParams.get('industry') ?? 'all';
  const country  = searchParams.get('country')  ?? 'all';

  const { data, error, status } = await ivylensRequest(
    `/company/benchmarks/${encodeURIComponent(industry)}/${encodeURIComponent(country)}`,
  );

  if (error) {
    return NextResponse.json({ error }, { status: status || 502 });
  }

  return NextResponse.json(data);
}
