import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { buildPatch } from '@/lib/athletes/validate';
import { sendEmail, buildAthleteWelcomeEmail, nextBusinessSendAt } from '@/lib/email';

export const runtime = 'nodejs';

interface PostBody {
  full_name?: string;
  email?: string | null;
  sport?: string | null;
  previous_role?: string | null;
  bio?: string | null;
  linkedin_url?: string | null;
  cv_kind?: 'file' | 'text' | null;
  cv_text?: string | null;
}

export async function POST(req: NextRequest) {
  // Read user + company from the middleware-stamped session cookie:
  // saves an auth.getUser() round-trip and a profiles.select() call.
  const { user, companyId } = await getSessionProfile();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!companyId) {
    return NextResponse.json({ error: 'no company assigned to profile' }, { status: 403 });
  }

  let body: PostBody;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.full_name?.trim()) {
    return NextResponse.json({ error: 'full_name is required' }, { status: 400 });
  }

  const patch = buildPatch(body);
  if ('error' in patch) {
    return NextResponse.json({ error: patch.error }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('athletes')
    .insert({
      company_id: companyId,
      ...patch,
      created_by: user.id,
    })
    .select('id, company_id, full_name, email, phone, sport, previous_role, bio, linkedin_url, avatar_url, cv_kind, cv_url, cv_filename, cv_mime, cv_text, called_at, welcome_email_sent_at, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Queue the Athletes To Industry welcome email — Resend dispatches
  // it 2 days from now, snapped into 09:00–17:00 GMT. Best-effort:
  // failures here never block the create response.
  const recipient = (body.email ?? '').trim();
  if (recipient) {
    const firstName = body.full_name?.trim().split(/\s+/)[0];
    const tpl = buildAthleteWelcomeEmail({ to: recipient, firstName });
    sendEmail({ ...tpl, scheduledAt: nextBusinessSendAt() })
      .catch(err => console.error('[athlete-welcome] queue failed', err));
  }

  return NextResponse.json({ row: data });
}
