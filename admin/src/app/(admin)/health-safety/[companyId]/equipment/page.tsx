import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import type { HsEquipment, HsEquipmentInspection, HsFile } from '@/lib/hs/types';
import EquipmentClient from '@/components/hs/EquipmentClient';

export const metadata: Metadata = { title: 'H&S equipment' };
export const dynamic = 'force-dynamic';

// Equipment register (112): register-shaped like compliance_items — a
// mutable next_inspection_due a session updates directly. Its own
// per-inspection evidence trail (114) is insert-only, like the
// register's own completions.
export default async function HealthSafetyEquipmentPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const [equipment, inspections] = await Promise.all([
    readAllPages<HsEquipment>((from, to) =>
      supabase.from('hs_equipment')
        .select('id, company_id, site_id, name, category, serial_number, status, last_inspected_on, next_inspection_due, notes, created_at, updated_at')
        .eq('company_id', params.companyId)
        .order('name').order('id')
        .range(from, to)),
    readAllPages<HsEquipmentInspection>((from, to) =>
      supabase.from('hs_equipment_inspections')
        .select('id, equipment_id, company_id, inspected_on, outcome, next_due_on, notes, recorded_by_kind, created_at')
        .eq('company_id', params.companyId)
        .order('inspected_on', { ascending: false }).order('id')
        .range(from, to)),
  ]);

  const inspectionIds = inspections.rows.map(i => i.id);
  const { data: files } = inspectionIds.length > 0
    ? await supabase.from('hs_files')
        .select('id, entity_type, entity_id, storage_path, file_name, size_bytes, created_at')
        .eq('company_id', params.companyId)
        .eq('entity_type', 'equipment_inspection')
        .in('entity_id', inspectionIds)
    : { data: [] };

  return (
    <EquipmentClient
      companyId={params.companyId}
      canRecord
      equipment={equipment.rows}
      inspections={inspections.rows}
      files={(files ?? []) as HsFile[]}
      loadError={equipment.error ?? inspections.error
        ?? (equipment.truncated ? 'Showing the first part of a long equipment list.' : null)}
    />
  );
}
