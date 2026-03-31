import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { updateMatchStage, isManatalConfigured } from '@/lib/manatal';

// POST /api/manatal/matches/move-stage
// Moves a candidate to a new pipeline stage in Manatal and notifies admin.
//
// Body: { matchId: number, stageId: number, stageName: string, candidateName: string, jobName: string }

export async function POST(req: NextRequest) {
  if (!isManatalConfigured()) {
    return NextResponse.json({ error: 'Manatal not configured' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, full_name, companies(manatal_client_id, name)')
    .eq('id', user.id)
    .single();

  const companyId: string = (profile as any)?.company_id ?? '';
  const companyName: string = (profile as any)?.companies?.name ?? 'A client';
  const manatalId: string = (profile as any)?.companies?.manatal_client_id ?? '';
  const userName: string = (profile as any)?.full_name ?? user.email ?? 'A user';

  if (!manatalId) {
    return NextResponse.json({ error: 'No Manatal client ID configured' }, { status: 400 });
  }

  const body = await req.json();
  const { matchId, stageId, stageName, candidateName, jobName } = body;

  if (!matchId || !stageId) {
    return NextResponse.json({ error: 'matchId and stageId are required' }, { status: 400 });
  }

  // Move the candidate in Manatal
  const updated = await updateMatchStage(matchId, stageId);
  if (!updated) {
    return NextResponse.json({ error: 'Failed to update stage in Manatal' }, { status: 502 });
  }

  // Notify all admin/recruiter users
  const { data: adminProfiles } = await supabase
    .from('profiles')
    .select('id')
    .in('role', ['tps_admin', 'tps_recruiter']);

  if (adminProfiles?.length) {
    const notifications = adminProfiles.map((p: any) => ({
      user_id:    p.id,
      company_id: companyId,
      type:       'candidate_stage_move',
      title:      `${candidateName ?? 'Candidate'} moved to ${stageName ?? 'new stage'}`,
      body:       `${userName} at ${companyName} moved ${candidateName ?? 'a candidate'} to "${stageName}" for ${jobName ?? 'a role'}.`,
      link:       '/hiring',
      read:       false,
    }));

    await supabase.from('notifications').insert(notifications);
  }

  return NextResponse.json({ success: true, match: updated });
}
