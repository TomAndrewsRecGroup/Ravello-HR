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
  const [{ data: files }, { data: company }, { data: qrTokens }, { data: hazards }, { data: isolations }, { data: permits }] = await Promise.all([
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
    // Reports a worker left via the item's own entity QR scan
    // (/e/[token] -> report-hazard, 201) land in `hazards` tagged with
    // `linked_asset_id` — nothing surfaced that back onto the asset
    // itself until now, so a scanned report was invisible from here.
    equipmentIds.length > 0
      ? supabase.from('hazards')
          .select('id, title, status, identified_at, linked_asset_id')
          .eq('company_id', params.companyId)
          .in('linked_asset_id', equipmentIds)
          .order('identified_at', { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [] as { id: string; title: string; status: string; identified_at: string; linked_asset_id: string }[] }),
    // UI/UX cross-linking pass (2026-10-03): an asset's own status
    // (quarantined/out_of_service) often traces back to an open
    // isolation or permit against it, but nothing here ever said why —
    // staff had to separately search the Isolations/Permits tabs. Only
    // the still-open ones (never 'removed'/'closed'/'revoked') are
    // worth showing here; a historical one has nothing left to explain.
    equipmentIds.length > 0
      ? supabase.from('isolations')
          .select('id, asset_id, isolation_type, status, applied_at')
          .eq('company_id', params.companyId)
          .in('asset_id', equipmentIds)
          .neq('status', 'removed')
          .order('applied_at', { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [] as { id: string; asset_id: string; isolation_type: string; status: string; applied_at: string }[] }),
    equipmentIds.length > 0
      ? supabase.from('permits')
          .select('id, asset_id, permit_number, status, issued_at')
          .eq('company_id', params.companyId)
          .in('asset_id', equipmentIds)
          .in('status', ['issued', 'suspended'])
          .order('issued_at', { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [] as { id: string; asset_id: string; permit_number: string | null; status: string; issued_at: string | null }[] }),
  ]);

  const hazardsByAsset = new Map<string, { id: string; title: string; status: string; identified_at: string }[]>();
  for (const h of hazards ?? []) {
    const list = hazardsByAsset.get(h.linked_asset_id) ?? [];
    list.push(h);
    hazardsByAsset.set(h.linked_asset_id, list);
  }

  const isolationsByAsset = new Map<string, { id: string; isolation_type: string; status: string; applied_at: string }[]>();
  for (const iso of isolations ?? []) {
    if (!iso.asset_id) continue;
    const list = isolationsByAsset.get(iso.asset_id) ?? [];
    list.push(iso);
    isolationsByAsset.set(iso.asset_id, list);
  }

  const permitsByAsset = new Map<string, { id: string; permit_number: string | null; status: string; issued_at: string | null }[]>();
  for (const p of permits ?? []) {
    if (!p.asset_id) continue;
    const list = permitsByAsset.get(p.asset_id) ?? [];
    list.push(p);
    permitsByAsset.set(p.asset_id, list);
  }

  return (
    <EquipmentClient
      companyId={params.companyId}
      companyName={company?.name ?? 'This client'}
      canRecord
      equipment={equipment.rows}
      inspections={inspections.rows}
      files={(files ?? []) as HsFile[]}
      activeQrEquipmentIds={new Set((qrTokens ?? []).map(t => t.entity_id))}
      hazardsByAsset={hazardsByAsset}
      isolationsByAsset={isolationsByAsset}
      permitsByAsset={permitsByAsset}
      loadError={equipment.error ?? inspections.error
        ?? (equipment.truncated ? 'Showing the first part of a long equipment list.' : null)}
    />
  );
}
