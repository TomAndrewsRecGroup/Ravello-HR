import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth/requireStaff';
import { auditLog } from '@/lib/audit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  const userId = params.id;
  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }

  // Hard guardrails: the admin cannot delete themselves, and no admin
  // can delete a tps_admin from this endpoint. Internal staff changes
  // need to go through Supabase directly so a stray click can't lock
  // the company out of its own portal.
  if (userId === auth.userId) {
    return NextResponse.json({ error: 'You cannot delete your own account here.' }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: profile, error: profErr } = await adminClient
    .from('profiles')
    .select('id, email, role, company_id')
    .eq('id', userId)
    .maybeSingle();

  if (profErr || !profile) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  if ((profile.role as string)?.startsWith('tps_')) {
    return NextResponse.json({
      error: 'Refusing to delete a People System staff account from this endpoint. Manage internal accounts via Supabase directly.',
    }, { status: 400 });
  }

  // Delete the auth user. profiles.id has ON DELETE CASCADE on
  // auth.users.id (migration 001), so the profile row goes with it.
  // We deliberately don't try to clean up application data the user
  // may have authored (tickets, actions, etc.) — those rows have
  // their own FK rules. Most reference auth.users with no cascade,
  // so they survive as orphans linked to a deleted user; that's the
  // intended behaviour for audit history.
  const { error: deleteErr } = await adminClient.auth.admin.deleteUser(userId);
  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  auditLog({
    action:      'user.deleted',
    actor_id:    auth.userId,
    target_id:   userId,
    target_type: 'profile',
    metadata:    { email: profile.email, company_id: profile.company_id, role: profile.role },
  });

  revalidatePath('/users');
  if (profile.company_id) revalidatePath(`/clients/${profile.company_id}`);

  return NextResponse.json({ success: true });
}
