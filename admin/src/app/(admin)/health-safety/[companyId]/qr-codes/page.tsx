import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/automation/runs';
import { readAllPages } from '@/lib/supabase/paged';
import QrCodesClient, { type QrItem } from '@/components/hs/QrCodesClient';

export const metadata: Metadata = { title: 'QR codes' };
export const dynamic = 'force-dynamic';

// One place to mint/revoke every entity QR code (196) for a client —
// closes the "QR code creation needs to be added to the admin side
// too... so that they can easily add and create the codes per client"
// gap. Equipment already had a mint panel buried inside each
// expanded row on the Equipment tab (unchanged, still there); COSHH
// assessments never had an admin-side mint path at all (COSHH is
// portal-only, so it was mint-from-portal-only before this page).
export default async function QrCodesPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const [{ data: company }, equipment, coshh] = await Promise.all([
    supabase.from('companies').select('name').eq('id', params.companyId).maybeSingle(),
    readAllPages<{ id: string; name: string; category: string | null; serial_number: string | null }>((from, to) =>
      supabase.from('hs_equipment')
        .select('id, name, category, serial_number')
        .eq('company_id', params.companyId)
        .order('name').order('id')
        .range(from, to)),
    readAllPages<{ id: string; title: string; status: string }>((from, to) =>
      supabase.from('coshh_assessments')
        .select('id, title, status')
        .eq('company_id', params.companyId)
        .order('title').order('id')
        .range(from, to)),
  ]);

  // entity_qr_tokens is RLS-on-no-policies (196) — service role only,
  // the exact worker_qr_tokens precedent the Equipment tab already
  // follows. It carries its own company_id, so no id-list join is
  // needed to scope this to one client.
  const { data: qrTokens } = await serviceClient().from('entity_qr_tokens')
    .select('entity_type, entity_id')
    .eq('company_id', params.companyId)
    .is('revoked_at', null)
    .limit(500);

  const activeEquipmentIds = new Set((qrTokens ?? []).filter(t => t.entity_type === 'equipment').map(t => t.entity_id));
  const activeCoshhIds = new Set((qrTokens ?? []).filter(t => t.entity_type === 'coshh_assessment').map(t => t.entity_id));

  const equipmentItems: QrItem[] = equipment.rows.map(e => ({
    id: e.id, label: e.name, subtitle: e.category ?? e.serial_number ?? null,
    apiPath: `/api/admin/hs/equipment/${e.id}/qr`, active: activeEquipmentIds.has(e.id),
  }));
  const coshhItems: QrItem[] = coshh.rows.map(c => ({
    id: c.id, label: c.title, subtitle: null,
    apiPath: `/api/admin/hs/coshh/${c.id}/qr`, active: activeCoshhIds.has(c.id),
  }));

  return (
    <QrCodesClient
      companyName={company?.name ?? 'This client'}
      equipment={equipmentItems}
      coshh={coshhItems}
      loadError={equipment.error ?? coshh.error
        ?? (equipment.truncated || coshh.truncated ? 'Showing the first part of a long list.' : null)}
    />
  );
}
