import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { buildPatch } from '@/lib/athletes/validate';
import { sendEmail, athleteWelcomeEmail, nextBusinessSendAt } from '@/lib/email';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PostBody {
  company_id?: string;
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
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  let body: PostBody;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.company_id || !UUID_RE.test(body.company_id)) {
    return NextResponse.json({ error: 'company_id is required' }, { status: 400 });
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
      company_id: body.company_id,
      ...patch,
      created_by: auth.userId,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Queue the Athletes To Industry welcome email — Resend dispatches
  // it 2 days from now, snapped into 09:00–17:00 GMT. Best-effort:
  // failures here never block the create response.
  const recipient = (body.email ?? '').trim();
  if (recipient) {
    const firstName = body.full_name?.trim().split(/\s+/)[0];
    const tpl = athleteWelcomeEmail({ to: recipient, firstName });
    sendEmail({ ...tpl, scheduledAt: nextBusinessSendAt() })
      .catch(err => console.error('[athlete-welcome] queue failed', err));
  }

  return NextResponse.json({ id: data.id });
}
