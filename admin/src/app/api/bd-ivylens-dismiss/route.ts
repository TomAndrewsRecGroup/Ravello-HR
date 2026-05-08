import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';

export const runtime = 'nodejs';

interface Body {
  ids:   string[];          // synthetic ids — must start with 'ivylens-'
  kind:  'company' | 'role';
}

// POST /api/bd-ivylens-dismiss
// Records one or more IvyLens synthetic ids as dismissed so they're
// filtered out of /bd-intelligence and /bd-roles on every render.
// Idempotent — duplicates are ignored.
export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  let body: Body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: 'ids[] required' }, { status: 400 });
  }
  if (body.kind !== 'company' && body.kind !== 'role') {
    return NextResponse.json({ error: 'kind must be company or role' }, { status: 400 });
  }
  // Defence in depth — never let a non-IvyLens id slip in.
  const ids = body.ids.filter(id => typeof id === 'string' && id.startsWith('ivylens-'));
  if (ids.length === 0) {
    return NextResponse.json({ error: 'no valid ivylens ids' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const rows = ids.map(synthetic_id => ({
    synthetic_id,
    kind:         body.kind,
    dismissed_by: auth.userId,
  }));

  const { error } = await supabase
    .from('bd_ivylens_dismissed')
    .upsert(rows, { onConflict: 'synthetic_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, count: ids.length });
}
