import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  getManatalMatches,
  getManatalStages,
  isManatalConfigured,
} from '@/lib/manatal';

// GET /api/manatal/matches
// Returns all candidate–job matches from Manatal for the authenticated client,
// grouped by job, plus available pipeline stages.

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  if (!isManatalConfigured()) {
    return NextResponse.json({ matches: [], stages: [], configured: false });
  }

  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, companies(manatal_client_id, name)')
    .eq('id', user.id)
    .single();

  const manatalId: string = (profile as any)?.companies?.manatal_client_id ?? '';
  if (!manatalId) {
    return NextResponse.json({ matches: [], stages: [], configured: false });
  }

  const [matches, stages] = await Promise.all([
    getManatalMatches(manatalId),
    getManatalStages(),
  ]);

  return NextResponse.json({ matches, stages, configured: true });
}
