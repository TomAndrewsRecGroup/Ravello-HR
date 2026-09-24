import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth/requireStaff';
import { auditLog } from '@/lib/audit';

// DELETE /api/admin/hs/providers/[id]/users/[userId] — revoke a provider
// login (staff only).
//
// Three things, in the order that cuts access fastest:
//   1. unlink: profiles.hs_provider_id = NULL. my_hs_provider_id() then
//      returns NULL, so every H&S policy denies this user on their very
//      next query, even with a JWT that is still valid for up to an hour.
//   2. burn any outstanding set-password links.
//   3. ban the auth user, so the session cannot be refreshed and they
//      cannot sign in again.
// The profile row and role stay: history (who recorded what) points at
// it, and hs_provider with no provider grants nothing.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BAN = '876000h';   // ~100 years; lifted only by a fresh invite

export async function DELETE(_request: NextRequest, { params }: { params: { id: string; userId: string } }) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  if (!UUID_RE.test(params.id) || !UUID_RE.test(params.userId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 });
  const service = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  // Only a login of THIS provider: the URL names both, and a mismatch is
  // a 404, never a revoke of somebody else.
  const { error: unlinkErr, count } = await service.from('profiles')
    .update({ hs_provider_id: null }, { count: 'exact' })
    .eq('id', params.userId)
    .eq('hs_provider_id', params.id)
    .eq('role', 'hs_provider');
  if (unlinkErr) return NextResponse.json({ error: unlinkErr.message }, { status: 500 });
  if (!count) return NextResponse.json({ error: 'That login is not linked to this provider.' }, { status: 404 });

  const [{ error: tokenErr }, { error: banErr }] = await Promise.all([
    service.from('profile_access_tokens').delete().eq('profile_id', params.userId),
    service.auth.admin.updateUserById(params.userId, { ban_duration: BAN }),
  ]);

  auditLog({
    action: 'hs_provider.user_revoked', actor_id: auth.userId, target_id: params.userId, target_type: 'profile',
    metadata: { provider_id: params.id },
  });
  revalidatePath('/health-safety/providers');

  // Access is already gone (step 1). Say so, and say what did not finish.
  if (tokenErr || banErr) {
    return NextResponse.json({
      success: true,
      warning: `Access removed, but ${banErr ? `the sign-in ban failed (${banErr.message})` : `old links could not be cleared (${tokenErr!.message})`}. Try again to finish.`,
    });
  }
  return NextResponse.json({ success: true });
}
