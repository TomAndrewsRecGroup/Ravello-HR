import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getManatalMatches, getManatalStages, updateMatchStage, isManatalConfigured } from '@/lib/manatal';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { emitEvent } from '@/lib/events/emit';
import { effectiveCompanyId } from '@/lib/auth/activeOrganisation';

// POST /api/manatal/matches/move-stage
// Moves a candidate to a new pipeline stage in Manatal and emits a
// platform event so staff are notified (admin lib/events/rules.ts).
//
// Body: { matchId: number, stageId: number, stageName: string, candidateName: string, jobName: string }

export async function POST(req: NextRequest) {
  if (!isManatalConfigured()) {
    return NextResponse.json({ error: 'Manatal not configured' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // The ACTIVE organisation, not the home one — see activeOrganisation.ts.
  const [activeCompanyId, { data: profile }] = await Promise.all([
    effectiveCompanyId(supabase),
    supabase.from('profiles').select('full_name').eq('id', user.id).single(),
  ]);
  const { data: company } = activeCompanyId
    ? await supabase.from('companies').select('manatal_client_id, name').eq('id', activeCompanyId).single()
    : { data: null };

  const companyId: string = activeCompanyId ?? '';
  const companyName: string = (company as any)?.name ?? 'A client';
  const manatalId: string = (company as any)?.manatal_client_id ?? '';
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

  // Tell staff through the platform outbox. This route used to insert
  // `notifications` rows for every tps_admin under the CLIENT'S session:
  // the profiles read returned nothing (RLS: a client sees only their
  // own row) and the INSERT policy refuses a client writing to a staff
  // user, so no recruiter was ever told. The emit uses the service
  // role; the company and user come from the verified session above,
  // never from the body.
  const { error: emitErr } = await emitEvent(createServiceSupabaseClient(), {
    companyId:  companyId || null,
    entityType: 'manatal_match',
    eventType:  'updated',
    actorId:    user.id,
    actorKind:  'client',
    payload: {
      match_id: matchId, stage_id: stageId,
      stage_name: typeof stageName === 'string' ? stageName : null,
      candidate_name: typeof candidateName === 'string' ? candidateName : null,
      job_name: typeof jobName === 'string' ? jobName : null,
      user_name: userName, company_name: companyName,
    },
  });
  if (emitErr) console.error('[move-stage] staff were not notified', emitErr);

  // Not the raw Manatal object: the client already has the match, and
  // echoing the upstream record back is how this route leaked data.
  return NextResponse.json({ success: true });
}
