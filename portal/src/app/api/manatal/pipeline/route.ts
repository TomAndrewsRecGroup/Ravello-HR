import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getManatalApplications, isManatalConfigured } from '@/lib/manatal';

// GET /api/manatal/pipeline
// Returns candidate applications from Manatal for the authenticated client,
// filtered to Submission stage and above (visible to client portal).

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  if (!isManatalConfigured()) {
    return NextResponse.json({ applications: [], configured: false });
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
    return NextResponse.json({ applications: [], configured: false });
  }

  // Client portal only sees candidates at Submission stage and above
  const applications = await getManatalApplications(manatalId, [
    'Submission', 'Phone Screen', 'Interview', 'Final Interview', 'Offer', 'Hired',
  ]);
  return NextResponse.json({ applications, configured: true });
}
