import { NextRequest, NextResponse } from 'next/server';
import { requireLiveSession } from '@/lib/auth/liveSession';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { emitEvent } from '@/lib/events/emit';
import { limiters, getUserRateLimitKey, rateLimitResponse } from '@/lib/rateLimit';
import { uuid } from '@/lib/validation/primitives';

// POST /api/portal/policy-acks/[id]/resend
//
// Re-issue an employee's acknowledgement link. The portal does not send
// email itself: it emits a policy_ack_resend event (service role, the
// company taken from the LIVE session and checked against the row) and
// the admin consumer mints a fresh link and emails it — one sender, one
// template. Only an open (pending / overdue) row can be resent.

export const runtime = 'nodejs';

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await requireLiveSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (session.role !== 'client_admin' && session.role !== 'tps_admin') return NextResponse.json({ error: 'You don\'t have permission to resend sign-off links.' }, { status: 403 });
  if (!session.companyId) return NextResponse.json({ error: 'No company' }, { status: 403 });
  if (!uuid.safeParse(params.id).success) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const rl = limiters.email.check(getUserRateLimitKey(req, session.userId));
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  const service = createServiceSupabaseClient();
  const { data } = await service.from('policy_acknowledgements').select('id, company_id, status, employee_id, document_id').eq('id', params.id).maybeSingle();
  const ack = data as { id: string; company_id: string; status: string; employee_id: string; document_id: string } | null;
  if (!ack || ack.company_id !== session.companyId) return NextResponse.json({ error: 'Acknowledgement not found' }, { status: 404 });
  if (ack.status !== 'pending' && ack.status !== 'overdue') return NextResponse.json({ error: 'This one is already signed.' }, { status: 409 });

  const { error } = await emitEvent(service, {
    companyId: ack.company_id, entityType: 'policy_ack_resend', entityId: ack.id, eventType: 'created',
    actorId: session.userId, actorKind: 'client',
    payload: { employee_id: ack.employee_id, document_id: ack.document_id },
  });
  if (error) return NextResponse.json({ error: 'Could not queue the resend. Try again.' }, { status: 500 });
  return NextResponse.json({ ok: true, queued: true });
}
