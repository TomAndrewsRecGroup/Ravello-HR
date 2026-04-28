import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { revalidateTag } from 'next/cache';
import { requireStaff } from '@/lib/auth/requireStaff';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Body {
  feature_flags?: Record<string, boolean>;
}

// Service-role client. The browser-side update from FeatureFlagToggles
// previously used the user's JWT — RLS allowed it, but tag invalidation
// never ran client-side, so the admin's clientDetail cache served stale
// flags after save. This route guarantees the write and flushes the
// per-client cache tag so the very next render is fresh.
function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  let body: Body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const flags = body.feature_flags;
  if (!flags || typeof flags !== 'object' || Array.isArray(flags)) {
    return NextResponse.json({ error: 'feature_flags must be an object' }, { status: 400 });
  }
  // Whitelist boolean values; drop anything else.
  const sanitised: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(flags)) {
    if (typeof v === 'boolean') sanitised[k] = v;
  }

  const sb = serviceClient();
  const { data, error } = await sb
    .from('companies')
    .update({ feature_flags: sanitised, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('id, feature_flags, monthly_retainer_pence, subscription_status')
    .single();

  if (error)  return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: 'company not found' }, { status: 404 });

  // Admin-side cache: clear the per-client tag so the next clientDetail
  // render reads fresh flags from the DB.
  revalidateTag(`client:${params.id}`);

  return NextResponse.json({
    ok: true,
    feature_flags: data.feature_flags,
    monthly_retainer_pence: data.monthly_retainer_pence,
    subscription_status: data.subscription_status,
  });
}
