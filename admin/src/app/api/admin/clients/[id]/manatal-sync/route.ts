import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { auditLog } from '@/lib/audit';
import { isManatalConfigured, createManatalOrganization, lastManatalError } from '@/lib/manatal';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/admin/clients/[id]/manatal-sync
// Retro-creates a Manatal organization for an existing TPS client
// (intended for clients onboarded before the Manatal integration
// shipped, or whose first onboarding-time Manatal create failed).
//
// - Loads the company.
// - 409s if manatal_client_id is already set (caller should clear it
//   first if they really want to recreate; prevents duplicate orgs).
// - Calls createManatalOrganization with external_id = company UUID.
// - Stamps manatal_client_id with the returned org id.
// - Audit-logs the operation.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid company id' }, { status: 400 });
  }
  if (!isManatalConfigured()) {
    return NextResponse.json({ error: 'Manatal is not configured on this environment.' }, { status: 503 });
  }

  const supabase = createServerSupabaseClient();
  const { data: company, error: loadErr } = await supabase
    .from('companies')
    .select('id, name, manatal_client_id')
    .eq('id', params.id)
    .single();
  if (loadErr || !company) {
    return NextResponse.json({ error: loadErr?.message ?? 'Company not found' }, { status: 404 });
  }
  if (company.manatal_client_id) {
    return NextResponse.json({
      error: 'This client already has a Manatal ID. Clear it on the profile first if you want to create a new Manatal org.',
      manatal_client_id: company.manatal_client_id,
    }, { status: 409 });
  }

  const org = await createManatalOrganization({
    name:        company.name,
    externalId:  company.id,
    description: 'TPS-managed client',
  });
  if (!org?.id) {
    const err = lastManatalError();
    return NextResponse.json({ error: err?.message ?? 'Manatal org create failed.' }, { status: 502 });
  }

  const { error: updErr } = await supabase
    .from('companies')
    .update({ manatal_client_id: org.id })
    .eq('id', company.id);
  if (updErr) {
    // Manatal already has the org — surface both ids so admin can
    // reconcile manually rather than creating a duplicate next time.
    return NextResponse.json({
      error: `Saved in Manatal but local update failed: ${updErr.message}`,
      manatal_client_id: org.id,
    }, { status: 500 });
  }

  auditLog({
    action:      'company.manatal_synced',
    actor_id:    auth.userId,
    target_id:   company.id,
    target_type: 'company',
    metadata:    { manatal_client_id: org.id, retro: true },
  });

  return NextResponse.json({ ok: true, manatal_client_id: org.id });
}
