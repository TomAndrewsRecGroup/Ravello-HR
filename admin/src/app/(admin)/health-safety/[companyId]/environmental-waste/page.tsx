import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import type { WasteStream, WasteMovement } from '@/lib/hs/types';
import type { Contractor } from '@/lib/hs/types';
import EnvironmentalWasteClient from '@/components/hs/EnvironmentalWasteClient';
import type { LinkedActionSummary } from '@/components/hs/LinkedActionBadge';

export const metadata: Metadata = { title: 'Waste' };
export const dynamic = 'force-dynamic';

// Core-OS 360 Phase 5, Group 2 (migration 157). Waste carriers and
// disposal sites are `contractors` rows (150) — never a parallel
// supplier table, so this page reads the same contractors list the
// Contractors tab manages.
export default async function HealthSafetyEnvironmentalWastePage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabaseClient();

  const [streams, movements, contractors] = await Promise.all([
    readAllPages<WasteStream>((from, to) =>
      supabase.from('waste_streams')
        .select('id, company_id, name, waste_code, hazardous, typical_disposal_route, created_by, created_at')
        .eq('company_id', params.companyId).order('name').order('id').range(from, to)),
    readAllPages<WasteMovement>((from, to) =>
      supabase.from('waste_movements')
        .select('id, company_id, waste_stream_id, site_id, moved_at, quantity, unit, carrier_contractor_id, disposal_site_contractor_id, consignment_note_reference, non_conformance, notes, created_by, created_at, updated_at')
        .eq('company_id', params.companyId).order('moved_at', { ascending: false }).order('id').range(from, to)),
    readAllPages<Contractor>((from, to) =>
      supabase.from('contractors').select('id, company_id, name, registration_number, contact_name, contact_email, contact_phone, approval_status, risk_rating, notes, created_by, created_at, updated_at')
        .eq('company_id', params.companyId).order('name').order('id').range(from, to)),
  ]);

  // UI/UX cross-linking pass (2026-10-03): a flagged non-conformance on
  // a waste movement raises a real corrective action
  // (environmentalRules.ts's own rules, source_type='waste_movement',
  // source_id=the movement's own id) that nothing here ever showed.
  const movementIds = movements.rows.map(m => m.id);
  const { data: linkedActions } = movementIds.length > 0
    ? await supabase.from('actions')
        .select('id, title, status, priority, due_date, verification_required, verified_at, source_id')
        .eq('company_id', params.companyId).eq('source_type', 'waste_movement').in('source_id', movementIds).limit(500)
    : { data: [] as (LinkedActionSummary & { source_id: string })[] };

  return (
    <EnvironmentalWasteClient
      companyId={params.companyId}
      streams={streams.rows}
      movements={movements.rows}
      contractors={contractors.rows}
      linkedActions={(linkedActions ?? []) as (LinkedActionSummary & { source_id: string })[]}
      loadError={streams.error ?? movements.error ?? contractors.error ?? null}
    />
  );
}
