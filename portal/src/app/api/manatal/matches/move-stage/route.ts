import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getManatalMatches, getManatalStages, updateMatchStage, isManatalConfigured } from '@/lib/manatal';

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

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const matchId = Number(body?.matchId);
  const stageId = Number(body?.stageId);
  const { stageName, candidateName, jobName } = body ?? {};

  if (!Number.isInteger(matchId) || matchId <= 0 || !Number.isInteger(stageId) || stageId <= 0) {
    return NextResponse.json({ error: 'matchId and stageId are required' }, { status: 400 });
  }

  // The match must belong to THIS client's Manatal organisation. The PATCH
  // below uses the platform-wide API key, so without this any signed-in
  // client could move — and read back — any match in the whole account by
  // guessing ids, including other clients' candidates and the referral
  // pipeline's applicants. Same set the GET route shows this client.
  const [ownMatches, stages] = await Promise.all([getManatalMatches(manatalId), getManatalStages()]);
  if (!ownMatches.some(m => m.id === matchId)) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 });
  }
  if (!stages.some(s => s.id === stageId)) {
    return NextResponse.json({ error: 'Unknown stage' }, { status: 400 });
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
    .eq('role', 'tps_admin');

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

  // Not the raw Manatal object: the client already has the match, and
  // echoing the upstream record back is how this route leaked data.
  return NextResponse.json({ success: true });
}
