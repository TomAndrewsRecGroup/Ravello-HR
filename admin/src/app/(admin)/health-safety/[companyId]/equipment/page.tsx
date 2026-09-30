import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/automation/runs';
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
  const equipmentIds = equipment.rows.map(e => e.id);
  const [{ data: files }, { data: company }, { data: qrTokens }] = await Promise.all([
    inspectionIds.length > 0
      ? supabase.from('hs_files')
          .select('id, entity_type, entity_id, storage_path, file_name, size_bytes, created_at')
          .eq('company_id', params.companyId)
          .eq('entity_type', 'equipment_inspection')
          .in('entity_id', inspectionIds)
      : Promise.resolve({ data: [] as HsFile[] }),
    supabase.from('companies').select('name').eq('id', params.companyId).maybeSingle(),
    // Core-OS 360 Completion Programme, Phase 26, Group 4 (C14.9).
    // entity_qr_tokens is RLS-on-no-policies (196) — service role only,
    // the exact worker_qr_tokens precedent (people/[id]/page.tsx's own
    // hasActiveWorkerQrToken() call). A plain staff session cannot read
    // this table at all, so this MUST go through the service client,
    // never `supabase` — and only the entity_id (presence), never the
    // token hash itself.
    equipmentIds.length > 0
      ? serviceClient().from('entity_qr_tokens').select('entity_id').eq('entity_type', 'equipment').is('revoked_at', null).in('entity_id', equipmentIds)
      : Promise.resolve({ data: [] as { entity_id: string }[] }),
  ]);

  return (
    <EquipmentClient
      companyId={params.companyId}
      companyName={company?.name ?? 'This client'}
      canRecord
      equipment={equipment.rows}
      inspections={inspections.rows}
      files={(files ?? []) as HsFile[]}
      activeQrEquipmentIds={new Set((qrTokens ?? []).map(t => t.entity_id))}
      loadError={equipment.error ?? inspections.error
        ?? (equipment.truncated ? 'Showing the first part of a long equipment list.' : null)}
    />
  );
}
