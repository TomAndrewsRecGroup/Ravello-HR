import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { auditLog } from '@/lib/audit';
import { sendEmail, athleteWelcomeEmail, lastEmailError } from '@/lib/email';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/admin/athletes/[id]/welcome-email
// Manual override for the Athletes To Industry welcome email.
//
// Normally the welcome email is queued by Resend for 2 days after
// the athlete row is created (snapped into 09:00-17:00 GMT). This
// route fires it immediately so admin staff can:
//   - backfill athletes added before the auto-email went live
//   - resend on request
//
// Tracks send via athletes.welcome_email_sent_at + sent_by so the
// UI can show 'Sent <when>' and prevent accidental double-sends.
// Doesn't refuse on a previous send — admin can re-send if they
// confirm; the timestamp updates each time.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid athlete id' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data: athlete, error: loadErr } = await supabase
    .from('athletes')
    .select('id, full_name, email')
    .eq('id', params.id)
    .single();
  if (loadErr || !athlete) {
    return NextResponse.json({ error: loadErr?.message ?? 'Athlete not found' }, { status: 404 });
  }
  const recipient = (athlete.email ?? '').trim();
  if (!recipient) {
    return NextResponse.json({
      error: 'This athlete has no email address on file. Add an email on the profile first.',
    }, { status: 400 });
  }

  const firstName = athlete.full_name?.trim().split(/\s+/)[0];
  const tpl = athleteWelcomeEmail({ to: recipient, firstName });
  const result = await sendEmail(tpl);
  if (!result?.delivered) {
    const err = lastEmailError();
    return NextResponse.json({
      error: err?.message ?? 'Email send failed (check Resend config).',
    }, { status: 502 });
  }

  const now = new Date().toISOString();
  await supabase
    .from('athletes')
    .update({ welcome_email_sent_at: now, welcome_email_sent_by: auth.userId })
    .eq('id', athlete.id);

  auditLog({
    action:      'athlete.welcome_email_sent',
    actor_id:    auth.userId,
    target_id:   athlete.id,
    target_type: 'athlete',
    metadata:    { to: recipient, resend_id: result.id, manual: true },
  });

  return NextResponse.json({
    ok: true,
    sent_at: now,
    resend_id: result.id,
  });
}
