import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { requireStaff } from '@/lib/auth/requireStaff';
import { auditLog } from '@/lib/audit';
import { detachAndDeleteStripeCustomer } from '@/lib/stripe';
import { wipeCompanyStorage } from '@/lib/storage/wipeCompany';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Hard-delete a client.
 *
 * Order of operations (each step waits for the previous; nothing past
 * step 1 fires unless ALL auth deletes succeed, so partial state is
 * impossible):
 *
 *   0. Confirm the operator typed the company name back.
 *   1. List all profiles in the company. Refuse if a tps_admin is
 *      attached. Delete every auth.users row in PARALLEL with
 *      Promise.allSettled (was a sequential abort-on-first-error loop
 *      that left N users deleted + company present). If ANY fails
 *      we abort before touching anything else and return the list.
 *   2. Cancel the live Stripe subscription and delete the customer
 *      so we stop billing. Best-effort: failures surface as warnings.
 *   3. Recursively wipe Supabase Storage prefixes (logos, CVs,
 *      reports, employee docs, athlete CVs). Best-effort.
 *   4. Delete the company row. Cascades take care of every other
 *      table that has ON DELETE CASCADE on company_id.
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

  // Pull the row + Stripe ids in one go so step 2 doesn't need a
  // second fetch.
  const { data: company, error: companyErr } = await adminClient
    .from('companies')
    .select('id, name, stripe_customer_id, stripe_subscription_id')
    .eq('id', companyId)
    .maybeSingle();

  if (companyErr || !company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  if (!body.confirm || body.confirm.trim().toLowerCase() !== (company.name ?? '').trim().toLowerCase()) {
    return NextResponse.json({
      error: 'Confirmation does not match company name. Pass { confirm: "<exact company name>" } in the request body.',
    }, { status: 400 });
  }

  // ── Step 1: profile + auth.users wipe ──────────────────────
  const { data: profiles, error: profErr } = await adminClient
    .from('profiles')
    .select('id, email, role')
    .eq('company_id', companyId);

  if (profErr) {
    return NextResponse.json({ error: `Could not list profiles: ${profErr.message}` }, { status: 500 });
  }

  const staffProfile = (profiles ?? []).find((p) => (p.role as string)?.startsWith('tps_'));
  if (staffProfile) {
    return NextResponse.json({
      error: `Refusing to delete: a People System staff account (${staffProfile.email}) is attached to this company. Reassign or remove them first.`,
    }, { status: 400 });
  }

  // Parallel deletes; allSettled so we collect EVERY failure in one
  // pass instead of aborting on first and leaving N already-deleted.
  const deleteResults = await Promise.allSettled(
    (profiles ?? []).map((p) => adminClient.auth.admin.deleteUser(p.id).then((r) => ({ p, r }))),
  );

  const userDeleteFailures: Array<{ email: string; error: string }> = [];
  const userDeleteSuccesses: string[] = [];
  for (let i = 0; i < deleteResults.length; i++) {
    const profile = (profiles ?? [])[i];
    const settled = deleteResults[i];
    if (settled.status === 'rejected') {
      userDeleteFailures.push({ email: profile.email ?? profile.id, error: String(settled.reason) });
    } else if (settled.value.r.error) {
      userDeleteFailures.push({ email: profile.email ?? profile.id, error: settled.value.r.error.message });
    } else {
      userDeleteSuccesses.push(profile.email ?? profile.id);
    }
  }

  if (userDeleteFailures.length > 0) {
    return NextResponse.json({
      error: 'Failed to delete one or more users. Company was NOT deleted; investigate and retry.',
      user_delete_failures: userDeleteFailures,
      user_delete_successes: userDeleteSuccesses,
    }, { status: 500 });
  }

  // ── Step 2: detach Stripe ──────────────────────────────────
  // Best-effort: at this point the auth users are gone, so we can't
  // undo step 1 — we proceed and surface Stripe failures as warnings
  // for operator follow-up.
  const stripeWarnings: string[] = [];
  const stripe = await detachAndDeleteStripeCustomer({
    customerId:     (company as any).stripe_customer_id ?? null,
    subscriptionId: (company as any).stripe_subscription_id ?? null,
  });
  if (!stripe.ok) stripeWarnings.push(...stripe.warnings);

  // ── Step 3: wipe storage prefixes ──────────────────────────
  const storage = await wipeCompanyStorage(adminClient, companyId);

  // ── Step 4: delete the company row (cascade) ───────────────
  const { error: deleteErr } = await adminClient
    .from('companies')
    .delete()
    .eq('id', companyId);

  if (deleteErr) {
    return NextResponse.json({
      error: `Users + storage cleaned but companies row delete failed: ${deleteErr.message}. Investigate orphan rows.`,
      storage_warnings: storage.errors,
      stripe_warnings:  stripeWarnings,
    }, { status: 500 });
  }

  auditLog({
    action:      'company.deleted',
    actor_id:    auth.userId,
    target_id:   companyId,
    target_type: 'company',
    metadata:    {
      name:                  (company as any).name,
      deleted_user_count:    profiles?.length ?? 0,
      storage_files_removed: storage.removed,
      storage_warnings:      storage.errors,
      stripe_warnings:       stripeWarnings,
    },
  });

  revalidateTag(`client:${companyId}`);
  revalidatePath('/clients');
  revalidatePath('/users');
  revalidatePath('/dashboard');

  return NextResponse.json({
    success:               true,
    deleted_user_count:    profiles?.length ?? 0,
    storage_files_removed: storage.removed,
    storage_warnings:      storage.errors,
    stripe_warnings:       stripeWarnings,
  });
}
