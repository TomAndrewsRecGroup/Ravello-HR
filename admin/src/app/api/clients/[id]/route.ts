import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { requireStaff } from '@/lib/auth/requireStaff';
import { auditLog } from '@/lib/audit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Hard-delete a client.
 *
 * Wipes the company and every related row from Supabase. This is the
 * destructive complement to archiving — there's no going back.
 *
 * Order of operations:
 *   1. Delete every auth.users row that has a profile in this company.
 *      profiles.id has ON DELETE CASCADE on auth.users.id, so the
 *      profile rows go with their auth users. Deleting via Supabase
 *      auth admin (rather than directly from profiles) makes sure the
 *      identities, sessions and refresh tokens are cleaned up too.
 *   2. Delete the company. Almost every table referencing companies(id)
 *      has ON DELETE CASCADE so requisitions, candidates, tickets,
 *      documents, employee records, leave, training etc. all go with
 *      it automatically. Migration 058 adds CASCADE to data_access_requests
 *      which previously had no cascade.
 *
 * Confirmation: the route requires {confirm: company_name} in the body
 * to prevent accidental deletes — the client's name has to be typed
 * back exactly.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  const companyId = params.id;
  if (!UUID_RE.test(companyId)) {
    return NextResponse.json({ error: 'Invalid company id' }, { status: 400 });
  }

  let body: { confirm?: string } = {};
  try { body = await req.json(); } catch { /* allow empty */ }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: company, error: companyErr } = await adminClient
    .from('companies')
    .select('id, name')
    .eq('id', companyId)
    .maybeSingle();

  if (companyErr || !company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  // Typed-name confirmation
  if (!body.confirm || body.confirm.trim().toLowerCase() !== (company.name ?? '').trim().toLowerCase()) {
    return NextResponse.json({
      error: 'Confirmation does not match company name. Pass { confirm: "<exact company name>" } in the request body.',
    }, { status: 400 });
  }

  // Step 1: delete every auth user whose profile is in this company.
  const { data: profiles, error: profErr } = await adminClient
    .from('profiles')
    .select('id, email, role')
    .eq('company_id', companyId);

  if (profErr) {
    return NextResponse.json({ error: `Could not list profiles: ${profErr.message}` }, { status: 500 });
  }

  // Refuse if a tps_admin is somehow attached to this company — bail
  // out before we wipe a staff account by accident.
  const staffProfile = (profiles ?? []).find((p) => (p.role as string)?.startsWith('tps_'));
  if (staffProfile) {
    return NextResponse.json({
      error: `Refusing to delete: a People System staff account (${staffProfile.email}) is attached to this company. Reassign or remove them first.`,
    }, { status: 400 });
  }

  const errors: string[] = [];
  for (const p of profiles ?? []) {
    const { error } = await adminClient.auth.admin.deleteUser(p.id);
    if (error) errors.push(`${p.email}: ${error.message}`);
  }

  if (errors.length) {
    return NextResponse.json({
      error: `Failed to delete ${errors.length} user(s): ${errors.join('; ')}. Company was NOT deleted; investigate and retry.`,
    }, { status: 500 });
  }

  // Step 2: delete the company. Cascades take care of the rest.
  const { error: deleteErr } = await adminClient
    .from('companies')
    .delete()
    .eq('id', companyId);

  if (deleteErr) {
    return NextResponse.json({
      error: `Users were deleted but company delete failed: ${deleteErr.message}. Investigate orphan rows.`,
    }, { status: 500 });
  }

  auditLog({
    action:      'company.deleted',
    actor_id:    auth.userId,
    target_id:   companyId,
    target_type: 'company',
    metadata:    {
      name: (company as any).name,
      deleted_user_count: profiles?.length ?? 0,
    },
  });

  revalidateTag(`client:${companyId}`);
  revalidatePath('/clients');
  revalidatePath('/users');
  revalidatePath('/dashboard');

  return NextResponse.json({
    success: true,
    deleted_user_count: profiles?.length ?? 0,
  });
}
