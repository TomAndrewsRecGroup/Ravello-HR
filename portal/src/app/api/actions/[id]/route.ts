import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Body {
  op?: 'complete' | 'dismiss_7d';
}

// PATCH /api/actions/[id]
//
// Two operations on a single endpoint:
//   - { op: 'complete' }   → mark the action complete
//   - { op: 'dismiss_7d' } → snooze for 7 days
//
// We re-check the action's company_id against the caller's company on
// the server so a typo in the URL can't accidentally tick someone
// else's action even if RLS were misconfigured. The actual write
// still happens through the user's session client, so RLS is the
// authoritative gate; this is belt-and-braces.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const { user, companyId } = await getSessionProfile();
  if (!user)      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!companyId) return NextResponse.json({ error: 'no company assigned' }, { status: 403 });

  let body: Body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  const { data: action, error: lookupErr } = await supabase
    .from('actions')
    .select('id, company_id, status')
    .eq('id', params.id)
    .maybeSingle();
  if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  if (!action || action.company_id !== companyId) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  let patch: Record<string, unknown>;
  if (body.op === 'complete') {
    patch = { status: 'complete', completed_at: new Date().toISOString() };
  } else if (body.op === 'dismiss_7d') {
    const until = new Date();
    until.setDate(until.getDate() + 7);
    patch = { dismiss_until: until.toISOString() };
  } else {
    return NextResponse.json({ error: 'unknown op' }, { status: 400 });
  }

  const { error: updErr } = await supabase
    .from('actions')
    .update(patch)
    .eq('id', params.id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
