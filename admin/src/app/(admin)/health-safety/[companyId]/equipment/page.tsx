import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import type { HsEquipment } from '@/lib/hs/types';
import EquipmentClient from '@/components/hs/EquipmentClient';

export const metadata: Metadata = { title: 'H&S equipment' };
export const dynamic = 'force-dynamic';

// Equipment register (112): register-shaped like compliance_items — a
// mutable next_inspection_due a session updates directly, no separate
// completion trail (MVP scope, noted in CLAUDE.md).
export default async function HealthSafetyEquipmentPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const equipment = await readAllPages<HsEquipment>((from, to) =>
    supabase.from('hs_equipment')
      .select('id, company_id, site_id, name, category, serial_number, status, last_inspected_on, next_inspection_due, notes, created_at, updated_at')
      .eq('company_id', params.companyId)
      .order('name').order('id')
      .range(from, to));

  return (
    <EquipmentClient
      companyId={params.companyId}
      canRecord
      equipment={equipment.rows}
      loadError={equipment.error ?? (equipment.truncated ? 'Showing the first part of a long equipment list.' : null)}
    />
  );
}
