import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getManatalJobs, isManatalConfigured } from '@/lib/manatal';

// GET /api/manatal/jobs
// Returns live Manatal jobs for the authenticated client's manatal_client_id.
// Server-side proxy — MANATAL_API_KEY never reaches the browser.

export async function GET(_req: NextRequest) {
  if (!isManatalConfigured()) {
    return NextResponse.json({ jobs: [], configured: false });
  }

  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, companies(manatal_client_id)')
    .eq('id', user.id)
    .single();

  const manatalId: string = (profile as any)?.companies?.manatal_client_id ?? '';
  if (!manatalId) {
    return NextResponse.json({ jobs: [], configured: false, message: 'No Manatal client ID configured for this company' });
  }

  const jobs = await getManatalJobs(manatalId);
  return NextResponse.json({ jobs, configured: true });
}
