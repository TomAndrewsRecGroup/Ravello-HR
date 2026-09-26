import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { sendTestInvite } from '@/lib/hs/testInvite';

export const runtime = 'nodejs';

// POST /api/admin/hs/test-assignments/[id]/resend — a fresh link for one
// pending assignment. Day-scoped dedupe key: a genuine second click the
// same day is a no-op (sendKeyedEmail's own claim), but a resend
// tomorrow is a real, distinct send — unlike the bulk-invite's per-
// assignment key, which must NEVER repeat.
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const { data: a } = await supabase.from('hs_test_assignments').select('id, status').eq('id', params.id).maybeSingle();
  if (!a) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  if (a.status === 'completed') return NextResponse.json({ error: 'Already completed' }, { status: 400 });

  const day = new Date().toISOString().slice(0, 10);
  const r = await sendTestInvite(supabase, params.id, `test_invite_resend:${params.id}:${day}`);
  if (r.outcome === 'sent') return NextResponse.json({ outcome: r.outcome });
  return NextResponse.json({ outcome: r.outcome, error: r.error }, { status: r.outcome === 'no_email' ? 400 : 502 });
}
